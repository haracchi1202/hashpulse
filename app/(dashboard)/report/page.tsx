import Link from "next/link";
import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";
import { analyzeReactions, type ReactionInput, type ClassifiedPost } from "@/skills/reaction";
import { formatNumber } from "@/lib/utils";
import { CollectCommentsButton } from "@/components/dashboard/collect-comments-button";
import { PrintButton } from "@/components/dashboard/print-button";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ searchId?: string }>;
}

const POLARITY_LABEL: Record<string, string> = {
  positive: "ポジティブ",
  negative: "ネガティブ",
  neutral: "ニュートラル",
};
const POLARITY_COLOR: Record<string, string> = {
  positive: "bg-emerald-500",
  negative: "bg-rose-500",
  neutral: "bg-zinc-500",
};

function Bar({ label, count, pct, color = "bg-primary" }: { label: string; count: number; pct: number; color?: string }) {
  const w = Math.round(pct * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground font-tabular">{formatNumber(count)}（{w}%）</span>
      </div>
      <div className="h-2 rounded bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

function PostCard({ p }: { p: ClassifiedPost }) {
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noreferrer noopener"
      className="block rounded-lg border border-border bg-card/40 p-3 space-y-2 hover:bg-secondary/40 transition-colors"
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="uppercase">{p.platform} · @{p.authorUsername}</span>
        <span className="font-tabular">♥{formatNumber(p.likeCount)} 💬{formatNumber(p.replyCount)}</span>
      </div>
      <p className="text-sm line-clamp-3">{p.text || "（本文なし）"}</p>
      {p.emotions.length ? (
        <div className="flex flex-wrap gap-1">
          {p.emotions.map((e) => (
            <span key={e} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{e}</span>
          ))}
        </div>
      ) : null}
    </a>
  );
}

function CommentCard({ p }: { p: ClassifiedPost }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3 space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="uppercase">{p.platform}{p.authorUsername ? ` · @${p.authorUsername}` : ""}</span>
        <span className="font-tabular">♥{formatNumber(p.likeCount)}</span>
      </div>
      <p className="text-sm line-clamp-3">{p.text || "（本文なし）"}</p>
      {p.emotions.length ? (
        <div className="flex flex-wrap gap-1">
          {p.emotions.map((e) => (
            <span key={e} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{e}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default async function ReportPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const { searchId } = await searchParams;

  const latest = searchId
    ? await prisma.search.findFirst({ where: { id: searchId, userId: user.id } })
    : await prisma.search.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

  const posts = latest
    ? await prisma.post.findMany({
        where: { searchId: latest.id },
        include: { account: true },
        take: 2000,
      })
    : [];

  const input: ReactionInput[] = posts.map((p) => ({
    id: p.id,
    text: p.text,
    platform: p.platform,
    likeCount: p.likeCount,
    retweetCount: p.retweetCount,
    replyCount: p.replyCount,
    quoteCount: p.quoteCount,
    impressionCount: p.impressionCount,
    url: p.url,
    authorUsername: p.account.username,
  }));

  const r = analyzeReactions(input);
  const posPct = Math.round(r.polarityPct.positive * 100);

  // コメント（X=リプライ / TikTok・IG=コメント）の反響。投稿本文とは別に集計する。
  // 注: スキーマ変更直後はホットリロードだと Prisma クライアントが再生成前のままで
  // prisma.comment が未定義のことがある。その場合はクラッシュさせず空扱い（dev サーバ再起動で有効化）。
  const commentModelReady = Boolean((prisma as unknown as { comment?: unknown }).comment);
  const comments = latest && commentModelReady
    ? await prisma.comment.findMany({
        where: { post: { searchId: latest.id } },
        orderBy: { likeCount: "desc" },
        take: 3000,
      })
    : [];
  const commentInput: ReactionInput[] = comments.map((c) => ({
    id: c.id,
    text: c.text,
    platform: c.platform,
    likeCount: c.likeCount,
    retweetCount: 0,
    replyCount: 0,
    quoteCount: 0,
    impressionCount: 0,
    url: "",
    authorUsername: c.authorUsername ?? "",
  }));
  const cr = analyzeReactions(commentInput);

  return (
    <div className="px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">反響レポート</h1>
          <p className="text-sm text-muted-foreground">
            {latest ? <span className="font-mono">{latest.query}</span> : "まだ検索がありません"}
          </p>
          <p className="text-xs text-muted-foreground/80">
            ※ 投稿本文・コメントの内容をもとに感情・情緒タグ・トピックを評価しています（ルールベース）。
          </p>
        </div>
        {r.total > 0 ? <PrintButton /> : null}
      </header>

      {r.total === 0 ? (
        <div className="rounded-lg border border-border bg-card/40 p-8 text-center text-muted-foreground">
          分析対象の投稿がありません。<Link href="/search" className="text-primary hover:underline">新規検索</Link>を実行してください。
        </div>
      ) : (
        <>
          {/* 反響サマリー */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "投稿数", value: formatNumber(r.total) },
              { label: "ポジティブ率", value: `${posPct}%` },
              { label: "総エンゲージメント", value: formatNumber(r.engagement.total) },
              { label: "総表示数 / 再生数", value: r.hasImpressions ? formatNumber(r.engagement.impressions) : "—" },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-border bg-card/40 p-4">
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="text-2xl font-bold font-tabular mt-1">{c.value}</div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 感情の割合 */}
            <section className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">感情の割合</h2>
              <div className="space-y-3">
                {(["positive", "negative", "neutral"] as const).map((k) => (
                  <Bar key={k} label={POLARITY_LABEL[k]} count={r.polarity[k]} pct={r.polarityPct[k]} color={POLARITY_COLOR[k]} />
                ))}
              </div>
            </section>

            {/* 情緒タグ */}
            <section className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">情緒タグの割合（上位）</h2>
              <div className="space-y-3">
                {r.emotions.slice(0, 8).map((e) => (
                  <Bar key={e.tag} label={e.tag} count={e.count} pct={e.pct} />
                ))}
                {r.emotions.length === 0 ? <p className="text-xs text-muted-foreground">該当なし</p> : null}
              </div>
            </section>

            {/* 投稿の分類 */}
            <section className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">投稿の分類</h2>
              <div className="space-y-3">
                {r.topics.slice(0, 8).map((t) => (
                  <Bar key={t.tag} label={t.tag} count={t.count} pct={t.pct} />
                ))}
              </div>
            </section>

            {/* SNS別 */}
            <section className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">SNS 別の反響</h2>
              <table className="w-full text-sm font-tabular">
                <thead>
                  <tr className="text-muted-foreground border-b border-border text-xs">
                    <th className="text-left font-medium py-1.5">SNS</th>
                    <th className="text-right font-medium py-1.5 px-2">投稿</th>
                    <th className="text-right font-medium py-1.5 px-2 text-emerald-500">ポジ</th>
                    <th className="text-right font-medium py-1.5 px-2 text-rose-500">ネガ</th>
                    <th className="text-right font-medium py-1.5 px-2">中立</th>
                  </tr>
                </thead>
                <tbody>
                  {r.byPlatform.map((pf) => (
                    <tr key={pf.platform} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5">{pf.platform}</td>
                      <td className="py-1.5 px-2 text-right">{formatNumber(pf.count)}</td>
                      <td className="py-1.5 px-2 text-right">{formatNumber(pf.positive)}</td>
                      <td className="py-1.5 px-2 text-right">{formatNumber(pf.negative)}</td>
                      <td className="py-1.5 px-2 text-right">{formatNumber(pf.neutral)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          {/* 所見 */}
          <section className="rounded-lg border border-border bg-card/40 p-4 space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">所見</h2>
            <ul className="space-y-1.5 text-sm">
              {r.insights.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* 代表的な投稿 */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-emerald-500">好意的な反響 TOP（エンゲージメント順）</h2>
              <div className="space-y-2">
                {r.topPositive.length ? r.topPositive.map((p) => <PostCard key={p.id} p={p} />) : <p className="text-xs text-muted-foreground">該当なし</p>}
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-rose-500">否定的な反響 TOP（エンゲージメント順）</h2>
              <div className="space-y-2">
                {r.topNegative.length ? r.topNegative.map((p) => <PostCard key={p.id} p={p} />) : <p className="text-xs text-muted-foreground">該当なし</p>}
              </div>
            </div>
          </section>

          {/* コメントの反響 */}
          <section className="space-y-4 rounded-lg border border-border bg-card/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">コメントの反響</h2>
                <p className="text-xs text-muted-foreground">
                  上位投稿のコメント（X=リプライ / TikTok・IG=コメント）を取得して感情を評価します。
                </p>
              </div>
              {latest ? (
                <div className="no-print">
                  <CollectCommentsButton searchId={latest.id} />
                </div>
              ) : null}
            </div>

            {cr.total === 0 ? (
              <p className="text-sm text-muted-foreground">
                まだコメントを取得していません。右上のボタンで取得すると、ここにコメントの反響が表示されます。
              </p>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "コメント数", value: formatNumber(cr.total) },
                    { label: "ポジティブ率", value: `${Math.round(cr.polarityPct.positive * 100)}%` },
                    { label: "ネガティブ率", value: `${Math.round(cr.polarityPct.negative * 100)}%` },
                    { label: "総いいね", value: formatNumber(cr.engagement.likes) },
                  ].map((c) => (
                    <div key={c.label} className="rounded-lg border border-border p-3">
                      <div className="text-xs text-muted-foreground">{c.label}</div>
                      <div className="text-xl font-bold font-tabular mt-1">{c.value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h3 className="text-xs font-medium text-muted-foreground">感情の割合</h3>
                    {(["positive", "negative", "neutral"] as const).map((k) => (
                      <Bar key={k} label={POLARITY_LABEL[k]} count={cr.polarity[k]} pct={cr.polarityPct[k]} color={POLARITY_COLOR[k]} />
                    ))}
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xs font-medium text-muted-foreground">情緒タグ（上位）</h3>
                    {cr.emotions.slice(0, 6).map((e) => (
                      <Bar key={e.tag} label={e.tag} count={e.count} pct={e.pct} />
                    ))}
                    {cr.emotions.length === 0 ? <p className="text-xs text-muted-foreground">該当なし</p> : null}
                  </div>
                </div>

                <ul className="space-y-1.5 text-sm">
                  {cr.insights.map((t, i) => (
                    <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{t}</span></li>
                  ))}
                </ul>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium text-emerald-500">好意的なコメント TOP</h3>
                    {cr.topPositive.length ? cr.topPositive.map((p) => <CommentCard key={p.id} p={p} />) : <p className="text-xs text-muted-foreground">該当なし</p>}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium text-rose-500">否定的なコメント TOP</h3>
                    {cr.topNegative.length ? cr.topNegative.map((p) => <CommentCard key={p.id} p={p} />) : <p className="text-xs text-muted-foreground">該当なし</p>}
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
