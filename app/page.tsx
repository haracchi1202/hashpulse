import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { RESEARCH_SCOPE } from "@/lib/research-scope";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-3xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          Hash<span className="text-primary">Pulse</span>
        </h1>
        <p className="text-lg text-muted-foreground">
          X (Twitter)・Instagram・TikTok のハッシュタグを横断分析する SaaS。
          AND / OR / NOT 検索、KPI ダッシュボード、インフルエンサーランキング。
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link
            href="/sign-in"
            className="px-6 py-2 rounded-md bg-primary text-primary-foreground font-medium"
          >
            ログイン
          </Link>
          <Link
            href="/sign-up"
            className="px-6 py-2 rounded-md border border-border font-medium"
          >
            無料登録
          </Link>
        </div>

        <section className="pt-10 text-left">
          <h2 className="text-sm font-semibold text-muted-foreground text-center mb-4">
            各 SNS のリサーチ範囲（対象期間）
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {RESEARCH_SCOPE.map((s) => (
              <div
                key={s.platform}
                className="rounded-lg border border-border p-4 space-y-2"
              >
                <div className="font-semibold">{s.platform}</div>
                <div className="text-xs font-medium text-primary">{s.period}</div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {s.notes.map((n) => (
                    <li key={n}>・{n}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
