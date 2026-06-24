import { RESEARCH_SCOPE } from "@/lib/research-scope";

// 各 SNS のリサーチ範囲と対象期間を 3 カードで表示する。
// landing（ログイン前）と dashboard（ログイン後）の両方で使う。
export function ResearchScopeCards({ heading = true }: { heading?: boolean }) {
  return (
    <section className="space-y-3">
      {heading ? (
        <h2 className="text-sm font-medium text-muted-foreground">
          各 SNS のリサーチ範囲（対象期間）
        </h2>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {RESEARCH_SCOPE.map((s) => (
          <div key={s.platform} className="rounded-lg border border-border bg-card/40 p-4 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{s.platform}</span>
              <span className="text-xs font-medium text-primary shrink-0">{s.period}</span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              {s.notes.map((n) => (
                <li key={n}>・{n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
