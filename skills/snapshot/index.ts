import { prisma } from "@/skills/prisma";
import { dailyTimeseries } from "@/skills/analytics";

export interface SnapshotResult {
  /** 書き込んだ日数 */
  days: number;
}

/**
 * 指定 Search の Post から日別事前集計（Snapshot）を生成・upsert する。
 * - ER の算出ロジックは `dailyTimeseries` を再利用（impression ベース or follower ベース）。
 * - Snapshot 固有の totalRetweets のみ日別に別集計して合算。
 * - [searchId, date] でユニーク upsert。投稿削除等で消えた日付の Snapshot は削除して整合を取る。
 *
 * 主に cron（saved 検索の再収集後）から呼ばれるが、`runCollection` 経由で
 * 手動検索時にも生成されるため、ダッシュボード/比較の事前集計として常に最新化される。
 */
export async function generateSnapshots(searchId: string): Promise<SnapshotResult> {
  const posts = await prisma.post.findMany({
    where: { searchId },
    include: { account: true },
    orderBy: { postedAt: "asc" },
  });

  const rows = posts.map((p) => ({
    postedAt: p.postedAt,
    likeCount: p.likeCount,
    retweetCount: p.retweetCount,
    replyCount: p.replyCount,
    quoteCount: p.quoteCount,
    impressionCount: p.impressionCount,
    authorFollowers: p.account.followers,
  }));

  const ts = dailyTimeseries(rows);

  // 日別 retweet 合計（Snapshot に必要だが TimeseriesPoint には無い）
  const retweetByDate = new Map<string, number>();
  for (const r of rows) {
    const date = new Date(r.postedAt).toISOString().slice(0, 10);
    retweetByDate.set(date, (retweetByDate.get(date) ?? 0) + r.retweetCount);
  }

  const keepDates: Date[] = [];

  for (const point of ts) {
    const date = new Date(`${point.date}T00:00:00.000Z`);
    keepDates.push(date);
    const payload = {
      postCount: point.postCount,
      totalLikes: point.totalLikes,
      totalRetweets: retweetByDate.get(point.date) ?? 0,
      totalImpressions: point.totalImpressions,
      avgER: point.avgER,
    };
    await prisma.snapshot.upsert({
      where: { searchId_date: { searchId, date } },
      create: { searchId, date, ...payload },
      update: payload,
    });
  }

  // 現存しない日付の Snapshot を削除（投稿削除時の整合）
  await prisma.snapshot.deleteMany({
    where: {
      searchId,
      date: { notIn: keepDates.length > 0 ? keepDates : [new Date(0)] },
    },
  });

  return { days: ts.length };
}
