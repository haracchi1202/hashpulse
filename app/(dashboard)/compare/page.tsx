import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";
import { HashtagCompare } from "@/components/dashboard/hashtag-compare";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const user = await requireUser();

  const searches = await prisma.search.findMany({
    where: { userId: user.id },
    orderBy: [{ saved: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      query: true,
      name: true,
      platforms: true,
      saved: true,
      createdAt: true,
    },
  });

  const options = searches.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="px-8 py-8 space-y-6 max-w-[1400px] mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">ハッシュタグ比較</h1>
        <p className="text-sm text-muted-foreground">
          複数の検索を重ねて推移を比較します（最大 6 件）。メトリクスは投稿数・いいね・表示数・ER から選択。
        </p>
      </header>

      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          比較できる検索がありません。まず「新規検索」から実行してください。
        </p>
      ) : (
        <HashtagCompare searches={options} />
      )}
    </div>
  );
}
