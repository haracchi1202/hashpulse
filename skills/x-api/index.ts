import type { NormalizedPost } from "@/lib/types";
import { searchRecent } from "./search";
import { searchTwitterApiIo } from "./twitterapi";
import type { XSearchOptions } from "./types";

export { searchRecent } from "./search";
export { searchTwitterApiIo } from "./twitterapi";
export { XApiError } from "./client";
export type { XSearchOptions, XTweet, XUser, XSearchResponse } from "./types";

export type XSearchProvider = "official" | "twitterapi";

/**
 * X 検索プロバイダを env から解決する。
 * - official  : 公式 X API v2 /tweets/search/recent（直近7日のみ）
 * - twitterapi: twitterapi.io advanced_search（全期間・非公式・従量 $0.00015/件）
 * 既定は official。
 */
export function getXSearchProvider(): XSearchProvider {
  const p = (process.env.X_SEARCH_PROVIDER ?? "official").toLowerCase();
  return p === "twitterapi" ? "twitterapi" : "official";
}

/**
 * プロバイダを意識せず X を検索する統一エントリ。
 * 呼び出し側（collect 等）はこれを使う。返り値は NormalizedPost[] で両者共通。
 */
export async function searchX(opts: XSearchOptions): Promise<NormalizedPost[]> {
  return getXSearchProvider() === "twitterapi"
    ? searchTwitterApiIo(opts)
    : searchRecent(opts);
}
