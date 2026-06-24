import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";
import { aggregateKPI, aggregateKPIByPlatform, dailyTimeseries, rankInfluencers } from "@/skills/analytics";
import { SearchForm } from "@/components/dashboard/search-form";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PlatformBreakdown } from "@/components/dashboard/platform-breakdown";
import { ResearchScopeCards } from "@/components/dashboard/research-scope";
import { InfluencerTable } from "@/components/dashboard/influencer-table";
import { DailyVolumeChart } from "@/components/charts/daily-volume";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ searchId?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const { searchId } = await searchParams;

  // searchId が無ければ最新を採用
  const latest =
    searchId
      ? await prisma.search.findFirst({ where: { id: searchId, userId: user.id } })
      : await prisma.search.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        });

  const posts = latest
    ? await prisma.post.findMany({
        where: { searchId: latest.id },
        include: { account: true },
        orderBy: { postedAt: "asc" },
      })
    : [];

  const rows = posts.map((p) => ({
    postedAt: p.postedAt,
    likeCount: p.likeCount,
    retweetCount: p.retweetCount,
    replyCount: p.replyCount,
    quoteCount: p.quoteCount,
    impressionCount: p.impressionCount,
    authorFollowers: p.account.followers,
    authorUsername: p.account.username,
    authorDisplayName: p.account.displayName ?? undefined,
    platform: p.platform,
  }));

  const kpi = aggregateKPI(rows);
  const byPlatform = aggregateKPIByPlatform(rows);
  const series = dailyTimeseries(rows);
  const influencers = rankInfluencers(rows, "er", 10);

  // 直近収集のエラー（プラットフォーム別）。レート上限(495)を明確にアラート表示する。
  const collectErrors: string[] = Array.isArray(latest?.lastErrors)
    ? (latest!.lastErrors as unknown[]).map(String)
    : [];
  const rateLimitErrors = collectErrors.filter((e) => /\b495\b|Maximum requests limit/i.test(e));
  const otherErrors = collectErrors.filter((e) => !rateLimitErrors.includes(e));
  // 495 が出た媒体名を抽出（"TikTok: EnsembleData 495: ..." の先頭ラベル）
  const rateLimitPlatforms = Array.from(
    new Set(rateLimitErrors.map((e) => e.split(":")[0].trim()).filter(Boolean))
  );

  // 収集対象に含めたのに 0 件だった媒体（エラー未捕捉のフォールバック表示用）。
  const PLATFORM_COUNT: Record<string, number> = {
    X: byPlatform.x.postCount,
    INSTAGRAM: byPlatform.instagram.postCount,
    TIKTOK: byPlatform.tiktok.postCount,
  };
  const PLATFORM_LABEL: Record<string, string> = { X: "X", INSTAGRAM: "Instagram", TIKTOK: "TikTok" };
  const emptyPlatforms =
    collectErrors.length === 0
      ? (latest?.platforms ?? []).filter((p) => (PLATFORM_COUNT[p] ?? 0) === 0)
      : [];

  return (
    <div className="px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {latest ? (
              <>
                <span className="font-mono">{latest.query}</span>
                <span className="ml-2 text-xs">
                  ({new Date(latest.createdAt).toLocaleString("ja-JP")})
                </span>
              </>
            ) : (
              "まだ検索がありません。下のフォームから実行してください。"
            )}
          </p>
        </div>
        {latest ? (
          <div className="flex shrink-0 gap-2">
            <a
              href={`/api/export/${latest.id}?format=csv`}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              CSV
            </a>
            <a
              href={`/api/export/${latest.id}?format=xlsx`}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              XLSX
            </a>
          </div>
        ) : null}
      </header>

      <SearchForm />

      <ResearchScopeCards />

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="投稿数" value={kpi.postCount} />
        <KpiCard label="合計いいね" value={kpi.totalLikes} />
        <KpiCard label="合計表示数" value={kpi.totalImpressions} />
        <KpiCard label="合計RT" value={kpi.totalRetweets} />
        <KpiCard label="平均 ER" value={kpi.avgER} format="percent" />
        <KpiCard label="平均表示数" value={Math.round(kpi.avgImpressions)} />
      </section>

      {rateLimitErrors.length > 0 ? (
        <div className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400 space-y-1">
          <div className="font-semibold">
            ⚠ データ提供元の日次リクエスト上限に達しました（HTTP 495）
          </div>
          <div>
            {rateLimitPlatforms.length ? `${rateLimitPlatforms.join(" / ")} ` : ""}
            のデータを取得できませんでした。EnsembleData（TikTok / Instagram）の本日分の上限超過です。
            上限がリセットされてから同じ条件で再検索すると取得できます。
          </div>
        </div>
      ) : null}

      {otherErrors.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400 space-y-1">
          <div className="font-medium">⚠ 一部の媒体で取得に失敗しました</div>
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            {otherErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {emptyPlatforms.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          <span className="font-medium">
            {emptyPlatforms.map((p) => PLATFORM_LABEL[p] ?? p).join(" / ")} が 0 件です。
          </span>{" "}
          {emptyPlatforms.some((p) => p === "TIKTOK" || p === "INSTAGRAM")
            ? "TikTok / Instagram はデータ提供元（EnsembleData）の日次リクエスト上限（HTTP 495）に達しているのが原因の可能性が高いです。上限がリセットされてから再検索してください。"
            : "検索語に該当が無かった可能性があります。"}
        </div>
      ) : null}

      <section>
        <PlatformBreakdown {...byPlatform} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card/40 p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">日別投稿数</h2>
          <DailyVolumeChart data={series} />
        </div>
        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">概要</h2>
          <dl className="text-sm space-y-2 font-tabular">
            <div className="flex justify-between"><dt className="text-muted-foreground">プラットフォーム</dt><dd>{latest?.platforms.join(", ") ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">期間</dt><dd>{series[0]?.date ?? "—"} ~ {series[series.length - 1]?.date ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">取得日時</dt><dd>{latest?.lastRunAt ? new Date(latest.lastRunAt).toLocaleString("ja-JP") : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">保存</dt><dd>{latest?.saved ? "Yes" : "No"}</dd></div>
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Top 10 Influencers (ER 順)</h2>
        <InfluencerTable rows={influencers} />
      </section>
    </div>
  );
}
