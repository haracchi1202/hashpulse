import type { NormalizedPost } from "@/lib/types";
import { searchTikTokEnsemble, TikTokApiError } from "./ensembledata";
import type { TikTokSearchOptions } from "./types";

export { searchTikTokEnsemble, TikTokApiError } from "./ensembledata";
export type { TikTokSearchOptions } from "./types";

export type TikTokProvider = "ensembledata";
export type TikTokSearchMode = "keyword" | "hashtag";

/** TikTok データプロバイダを env から解決する（既定 ensembledata）。 */
export function getTikTokProvider(): TikTokProvider {
  // 現状は ensembledata のみ。将来 apify 等を足すならここで分岐する。
  return "ensembledata";
}

/** TikTok 検索モードを env から解決する（既定 keyword=広く取る）。 */
export function getTikTokSearchMode(): TikTokSearchMode {
  return (process.env.TIKTOK_SEARCH_MODE ?? "keyword").toLowerCase() === "hashtag"
    ? "hashtag"
    : "keyword";
}

/**
 * プロバイダを意識せず TikTok を検索する統一エントリ。
 * collect から呼ぶ。返り値は NormalizedPost[] で X/IG と共通。
 */
export async function searchTikTok(
  opts: TikTokSearchOptions
): Promise<NormalizedPost[]> {
  const withMode = { ...opts, mode: opts.mode ?? getTikTokSearchMode() };
  switch (getTikTokProvider()) {
    case "ensembledata":
    default:
      return searchTikTokEnsemble(withMode);
  }
}
