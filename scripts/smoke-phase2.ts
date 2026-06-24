/**
 * Phase 2 ヘッドレス通し検証:
 *   実 API 収集(runCollection) → DB保存 → Snapshot自動生成 → 比較集計(compare API ロジック)
 *
 * 実行: npx tsx --env-file=.env.local scripts/smoke-phase2.ts
 *
 * SMOKE ラベル付きの saved 検索を2件作成（cadence=SIX_HOURLY）するので、
 * 復元後にブラウザの /compare でもそのまま比較表示を確認できる。
 */
import { Platform, Cadence } from "@prisma/client";
import { prisma } from "@/skills/prisma";
import { runCollection } from "@/skills/collect";
import { aggregateKPI, dailyTimeseries } from "@/skills/analytics";

const TARGETS = [
  { name: "SMOKE #AI", query: "#AI" },
  { name: "SMOKE #cat", query: "#cat" },
];

async function main() {
  // 1) ユーザー確保（実ユーザーがいればそれを使う＝ダッシュボードに出る）
  let user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    user = await prisma.user.create({
      data: { clerkId: "smoke-phase2", email: "smoke-phase2@local.test", name: "Smoke" },
    });
    console.log(`(created smoke user ${user.id})`);
  }
  console.log(`User: ${user.email} (${user.id})\n`);

  const searchIds: string[] = [];

  // 2) 検索作成 → 実 API 収集（IG 実 API）→ Snapshot 自動生成
  for (const t of TARGETS) {
    const search = await prisma.search.create({
      data: {
        userId: user.id,
        name: t.name,
        query: t.query,
        platforms: [Platform.INSTAGRAM],
        filters: {},
        saved: true,
        cadence: Cadence.SIX_HOURLY,
        lastRunAt: new Date(),
      },
    });
    searchIds.push(search.id);

    console.log(`▶ collecting "${t.query}" (search ${search.id}) ...`);
    const r = await runCollection({
      searchId: search.id,
      query: t.query,
      platforms: [Platform.INSTAGRAM],
      filters: {},
      maxResults: 25,
    });
    console.log(`  posts=${r.postCount} errors=${r.errors.length ? r.errors.join(" | ") : "none"}`);

    const snaps = await prisma.snapshot.findMany({
      where: { searchId: search.id },
      orderBy: { date: "asc" },
    });
    console.log(`  snapshots=${snaps.length}`);
    for (const s of snaps.slice(0, 5)) {
      console.log(
        `    ${s.date.toISOString().slice(0, 10)}  posts=${s.postCount} likes=${s.totalLikes} rt=${s.totalRetweets} imp=${s.totalImpressions} er=${(s.avgER * 100).toFixed(2)}%`
      );
    }
    console.log("");
  }

  // 3) 比較集計（/api/analytics/compare と同じロジック）
  console.log("=== compare aggregation (2 searches) ===");
  const posts = await prisma.post.findMany({
    where: { searchId: { in: searchIds } },
    include: { account: true },
    orderBy: { postedAt: "asc" },
  });
  for (const id of searchIds) {
    const s = await prisma.search.findUnique({ where: { id } });
    const rows = posts
      .filter((p) => p.searchId === id)
      .map((p) => ({
        postedAt: p.postedAt,
        likeCount: p.likeCount,
        retweetCount: p.retweetCount,
        replyCount: p.replyCount,
        quoteCount: p.quoteCount,
        impressionCount: p.impressionCount,
        authorFollowers: p.account.followers,
      }));
    const kpi = aggregateKPI(rows);
    const ts = dailyTimeseries(rows);
    console.log(
      `  "${s?.name}": postCount=${kpi.postCount} likes=${kpi.totalLikes} imp=${kpi.totalImpressions} avgER=${(kpi.avgER * 100).toFixed(2)}% / timeseries days=${ts.length}`
    );
  }

  console.log("\n✅ done. saved searchIds:", searchIds.join(", "));
  console.log("   → ブラウザ /compare でこの2件を選択して比較チャートを目視できます。");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("SMOKE ERROR:", e);
    process.exit(1);
  });
