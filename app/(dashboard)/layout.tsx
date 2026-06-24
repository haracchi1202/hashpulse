import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/search", label: "新規検索" },
  { href: "/posts", label: "投稿一覧" },
  { href: "/report", label: "反響レポート" },
  { href: "/influencers", label: "インフルエンサー" },
  { href: "/compare", label: "比較" },
  { href: "/saved", label: "保存検索" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-border bg-card/40 flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight">
            Hash<span className="text-primary">Pulse</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-border flex items-center justify-between">
          <UserButton afterSignOutUrl="/" />
          <span className="text-xs text-muted-foreground">v0.1 MVP</span>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
