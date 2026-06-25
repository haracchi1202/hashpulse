import { accountUrl, formatNumber, formatPercent } from "@/lib/utils";
import type { InfluencerRow } from "@/lib/types";

export function InfluencerTable({ rows }: { rows: InfluencerRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-card/50 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">アカウント</th>
            <th className="px-3 py-2 font-medium text-right">フォロワー</th>
            <th className="px-3 py-2 font-medium text-right">投稿</th>
            <th className="px-3 py-2 font-medium text-right">合計いいね</th>
            <th className="px-3 py-2 font-medium text-right">合計表示</th>
            <th className="px-3 py-2 font-medium text-right">平均 ER</th>
            <th className="px-3 py-2 font-medium">参照投稿</th>
          </tr>
        </thead>
        <tbody className="font-tabular">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                データなし
              </td>
            </tr>
          ) : (
            rows.map((r, i) => {
              const profileUrl = accountUrl(r.platform, r.authorUsername);
              return (
              <tr key={r.authorUsername} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2">
                  {profileUrl ? (
                    <a
                      href={profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group"
                    >
                      <div className="font-medium group-hover:underline underline-offset-2">
                        {r.authorDisplayName ?? r.authorUsername}
                      </div>
                      <div className="text-xs text-muted-foreground group-hover:text-primary">
                        @{r.authorUsername} ↗
                      </div>
                    </a>
                  ) : (
                    <>
                      <div className="font-medium">{r.authorDisplayName ?? r.authorUsername}</div>
                      <div className="text-xs text-muted-foreground">@{r.authorUsername}</div>
                    </>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(r.followers)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.postCount)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.totalLikes)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.totalImpressions)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(r.avgER)}</td>
                <td className="px-3 py-2">
                  {r.topPostUrl ? (
                    <a
                      href={r.topPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {r.platform === "INSTAGRAM"
                        ? "Instagram"
                        : r.platform === "TIKTOK"
                          ? "TikTok"
                          : "X"}{" "}
                      で開く ↗
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
