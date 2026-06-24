import type { NormalizedPost } from "@/lib/types";
import { igSearch as igSearchGraph } from "./client";
import { igSearchEnsemble } from "./ensembledata";
import type { IGSearchOptions } from "./types";

export { igSearchEnsemble, IGEnsembleError } from "./ensembledata";
export type { IGMedia, IGSearchOptions } from "./types";

export type IGProvider = "graph" | "ensembledata";

/**
 * Instagram 検索プロバイダを env から解決する（既定 graph）。
 * - graph       : 公式 Graph API Hashtag Search（IG_USE_MOCK=true ならモック）。Reels は取りこぼす。
 * - ensembledata: EnsembleData 経由。Reels(動画) も取得でき、投稿者の username/followers も取れる。
 */
export function getIGProvider(): IGProvider {
  return (process.env.IG_PROVIDER ?? "graph").toLowerCase() === "ensembledata"
    ? "ensembledata"
    : "graph";
}

/**
 * プロバイダを意識せず Instagram を検索する統一エントリ。collect から呼ぶ。
 * 返り値は NormalizedPost[] で X/TikTok と共通のドロップイン互換。
 */
export async function igSearch(opts: IGSearchOptions): Promise<NormalizedPost[]> {
  return getIGProvider() === "ensembledata"
    ? igSearchEnsemble(opts)
    : igSearchGraph(opts);
}
