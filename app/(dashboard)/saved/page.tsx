import Link from "next/link";
import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";

export const dynamic = "force-dynamic";

export default async function SavedSearchesPage() {
  const user = await requireUser();
  const items = await prisma.search.findMany({
    where: { userId: user.id, saved: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">保存検索</h1>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          まだ保存検索はありません。Phase 2 で「保存」フラグ付き検索 UI を実装予定。
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.id} className="rounded-md border border-border bg-card/40 px-3 py-2">
              <Link href={`/dashboard?searchId=${s.id}`} className="font-mono text-sm">
                {s.name ?? s.query}
              </Link>
              <div className="text-xs text-muted-foreground">
                {s.platforms.join(", ")} · {new Date(s.createdAt).toLocaleDateString("ja-JP")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
