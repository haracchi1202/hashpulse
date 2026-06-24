import Link from "next/link";
import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";
import { rankInfluencers, type RankBy } from "@/skills/analytics";
import { InfluencerTable } from "@/components/dashboard/influencer-table";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ searchId?: string; rankBy?: RankBy }>;
}

const SORTS: { key: RankBy; label: string }[] = [
  { key: "er", label: "ER 順" },
  { key: "likes", label: "いいね順" },
  { key: "impressions", label: "表示数順" },
];

export default async function InfluencersPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const { searchId, rankBy = "er" } = await searchParams;

  const latest = searchId
    ? await prisma.search.findFirst({ where: { id: searchId, userId: user.id } })
    : await prisma.search.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });

  const posts = latest
    ? await prisma.post.findMany({
        where: { searchId: latest.id },
        include: { account: true },
      })
    : [];

  const rows = posts.map((p) => ({
    authorUsername: p.account.username,
    authorDisplayName: p.account.displayName ?? undefined,
    authorFollowers: p.account.followers,
    likeCount: p.likeCount,
    retweetCount: p.retweetCount,
    replyCount: p.replyCount,
    quoteCount: p.quoteCount,
    impressionCount: p.impressionCount,
  }));

  const influencers = rankInfluencers(rows, rankBy, 30);
  const baseHref = `/influencers${latest ? `?searchId=${latest.id}` : ""}`;

  return (
    <div className="px-8 py-8 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">インフルエンサー</h1>
          <p className="text-sm text-muted-foreground">
            {latest ? <span className="font-mono">{latest.query}</span> : "まだ検索がありません"}
          </p>
        </div>
        <div className="flex gap-2">
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={`${baseHref}${baseHref.includes("?") ? "&" : "?"}rankBy=${s.key}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                rankBy === s.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-secondary"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </header>

      <InfluencerTable rows={influencers} />
    </div>
  );
}
