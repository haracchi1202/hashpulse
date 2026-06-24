import Link from "next/link";
import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";
import { PostTable, type PostRow } from "@/components/dashboard/post-table";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ searchId?: string }>;
}

export default async function PostsPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const { searchId } = await searchParams;

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
        orderBy: { impressionCount: "desc" },
        take: 1000,
      })
    : [];

  const rows: PostRow[] = posts.map((p) => ({
    id: p.id,
    platform: p.platform,
    postedAt: p.postedAt.toISOString(),
    authorUsername: p.account.username,
    authorDisplayName: p.account.displayName,
    followers: p.account.followers,
    text: p.text,
    url: p.url,
    likeCount: p.likeCount,
    retweetCount: p.retweetCount,
    replyCount: p.replyCount,
    quoteCount: p.quoteCount,
    impressionCount: p.impressionCount,
  }));

  return (
    <div className="px-8 py-8 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">投稿一覧</h1>
          <p className="text-sm text-muted-foreground">
            {latest ? (
              <span className="font-mono">{latest.query}</span>
            ) : (
              "まだ検索がありません"
            )}
          </p>
        </div>
        {latest ? (
          <div className="flex gap-2">
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
            <Link
              href={`/dashboard?searchId=${latest.id}`}
              className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium"
            >
              ダッシュボードへ
            </Link>
          </div>
        ) : null}
      </header>

      <PostTable rows={rows} />
    </div>
  );
}
