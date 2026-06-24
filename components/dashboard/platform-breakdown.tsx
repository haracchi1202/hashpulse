import type { PlatformKPI } from "@/skills/analytics";
import { formatNumber, formatPercent } from "@/lib/utils";

// X / Instagram / TikTok / 合計 の比較表。
// 「Xでどれくらい・IGでどれくらい・TikTokでどれくらい・合計」を一目で見えるようにする。
const METRICS: { key: keyof PlatformKPI["total"]; label: string; percent?: boolean }[] = [
  { key: "postCount", label: "投稿数" },
  { key: "totalLikes", label: "いいね" },
  { key: "totalRetweets", label: "RT / シェア" },
  { key: "totalReplies", label: "コメント" },
  { key: "totalImpressions", label: "表示数 / 再生数" },
  { key: "avgER", label: "平均 ER", percent: true },
];

function cell(value: number, percent?: boolean) {
  return percent ? formatPercent(value) : formatNumber(value);
}

export function PlatformBreakdown({ x, instagram, tiktok, total }: PlatformKPI) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          プラットフォーム別内訳（X / Instagram / TikTok / 合計）
        </h2>
        <span className="text-xs text-muted-foreground shrink-0">
          ※ IG は RT・表示数なし／TikTok は「RT/シェア」=シェア数・「表示数/再生数」=再生数
        </span>
      </div>
      <table className="w-full text-sm font-tabular">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left font-medium py-2">指標</th>
            <th className="text-right font-medium py-2 px-3">X</th>
            <th className="text-right font-medium py-2 px-3">Instagram</th>
            <th className="text-right font-medium py-2 px-3">TikTok</th>
            <th className="text-right font-semibold py-2 px-3 text-foreground">合計</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => (
            <tr key={m.key} className="border-b border-border/50 last:border-0">
              <td className="py-2 text-muted-foreground">{m.label}</td>
              <td className="py-2 px-3 text-right font-mono">{cell(x[m.key], m.percent)}</td>
              <td className="py-2 px-3 text-right font-mono">{cell(instagram[m.key], m.percent)}</td>
              <td className="py-2 px-3 text-right font-mono">{cell(tiktok[m.key], m.percent)}</td>
              <td className="py-2 px-3 text-right font-mono font-semibold">{cell(total[m.key], m.percent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
