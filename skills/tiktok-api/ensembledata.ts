import type { NormalizedPost } from "@/lib/types";
import type {
  TikTokSearchOptions,
  EnsembleAweme,
  EnsembleHashtagResponse,
} from "./types";

// EnsembleData = TikTok データの第三者プロバイダ。
// ハッシュタグ投稿を同期 HTTP GET で取得でき、再生数/いいね/コメント/シェア/保存が揃う。
// 認証は token クエリパラメータ（公式 API ではない従量課金サービス）。
// X の twitterapi.ts と同じ「プロバイダ差し込み」構造で実装している。
const BASE = "https://ensembledata.com/apis";
const HASHTAG_POSTS = "/tt/hashtag/posts";
const KEYWORD_SEARCH = "/tt/keyword/search";

// 暴走防止の安全弁。limit に達するか次ページが無くなれば先に止まる。
// 速度より網羅性を優先するため大きめ（250ページ×20件 = 最大5000件）。
const MAX_PAGES_SAFETY = 250;
// 連続リクエストの間隔（レート制御）。
const MIN_INTERVAL_MS = Number(process.env.TIKTOK_MIN_INTERVAL_MS ?? 1200);
const MAX_RETRIES_429 = 3;
// 1リクエストごとの上限（ハング対策）。
const FETCH_TIMEOUT_MS = Number(process.env.TIKTOK_FETCH_TIMEOUT_MS ?? 20000);
// TikTok 収集全体の時間予算。超えたら集まった分で打ち切り、関数 504 を防ぐ。
const TIKTOK_BUDGET_MS = Number(process.env.TIKTOK_BUDGET_MS ?? 35000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TikTokApiError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
    this.name = "TikTokApiError";
  }
}

function getToken(): string {
  const token = process.env.ENSEMBLEDATA_TOKEN;
  if (!token) {
    throw new TikTokApiError(
      "ENSEMBLEDATA_TOKEN is not set in environment (TIKTOK_PROVIDER=ensembledata)",
      500
    );
  }
  return token;
}

// EnsembleData の独自ステータスコードを、ダッシュボードにそのまま出せる日本語に翻訳する。
// 生の JSON をユーザーに見せても意味が伝わらないため。他のエラーは原文を保持する。
function friendlyEnsembleMessage(status: number, body: unknown): string {
  // 493: 契約(サブスクリプション)期限切れ。支払いを再開すれば復旧する。
  if (status === 493) {
    return "EnsembleData(TikTok/IG のデータ取得サービス)の契約が期限切れです。データを再開するには契約更新（支払い）が必要です。";
  }
  // 495: 当日の取得上限(daily units)を使い切った。翌 09:00(JST)にリセットされる。
  if (status === 495) {
    return "EnsembleData の本日の取得上限に達しました。翌日（UTC 0時 = 日本時間 午前9時）にリセットされます。";
  }
  const detail =
    body && typeof body === "object" && "detail" in body
      ? String((body as { detail?: unknown }).detail)
      : typeof body === "string"
        ? body
        : JSON.stringify(body);
  return `EnsembleData ${status}: ${detail}`;
}

function toUnixSeconds(iso?: string): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

// レスポンスの揺れを吸収して投稿配列を取り出す。
// 実構造: { data: { nextCursor, data: [...] } }。旧形(data:配列 / aweme_list)にも対応。
function extractAwemes(res: EnsembleHashtagResponse): EnsembleAweme[] {
  const d = res.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.data)) return d.data;
  if (d && Array.isArray(d.aweme_list)) return d.aweme_list;
  if (Array.isArray(res.aweme_list)) return res.aweme_list;
  return [];
}

function nextCursorOf(res: EnsembleHashtagResponse): string | undefined {
  const d = res.data;
  const c =
    (d && !Array.isArray(d) ? d.nextCursor ?? d.next_cursor : undefined) ??
    res.nextCursor ??
    res.next_cursor;
  return c === undefined || c === null ? undefined : String(c);
}

function normalize(a: EnsembleAweme): NormalizedPost {
  const s = a.statistics ?? {};
  const username = a.author?.unique_id ?? "unknown";
  const ts = a.create_time ? new Date(a.create_time * 1000).toISOString() : "";
  return {
    platform: "TIKTOK",
    externalId: a.aweme_id ?? "",
    authorExternalId: a.author?.uid ?? a.author?.id ?? a.author?.unique_id ?? "",
    authorUsername: username,
    authorDisplayName: a.author?.nickname,
    authorFollowers: a.author?.follower_count ?? 0,
    text: a.desc ?? "",
    postedAt: ts,
    url: `https://www.tiktok.com/@${username}/video/${a.aweme_id ?? ""}`,
    likeCount: s.digg_count ?? 0,
    retweetCount: s.share_count ?? 0, // TikTok に RT は無い → シェア数を拡散指標として格納
    replyCount: s.comment_count ?? 0,
    quoteCount: s.collect_count ?? 0, // 保存数
    impressionCount: s.play_count ?? 0, // 再生数を「表示数」として扱う
    hashtags: (a.text_extra ?? [])
      .map((t) => t.hashtag_name)
      .filter((x): x is string => Boolean(x)),
  };
}

async function fetchPage(
  endpoint: string,
  params: Record<string, string>,
  cursor: string
): Promise<EnsembleHashtagResponse> {
  const url = new URL(`${BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("token", getToken());
  if (cursor) url.searchParams.set("cursor", cursor);

  for (let attempt = 0; ; attempt++) {
    // EnsembleData の遅延/ハングで関数全体が 504 になるのを防ぐため、
    // 1リクエストごとに 20 秒で打ち切る。タイムアウトは collect 側の
    // try/catch が拾い、X/IG の結果は守られる。
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { "User-Agent": "HashPulse/0.1" },
        cache: "no-store",
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === "AbortError") {
        throw new TikTokApiError(
          `EnsembleData リクエストが ${FETCH_TIMEOUT_MS / 1000}秒でタイムアウトしました`,
          0
        );
      }
      throw e;
    }
    clearTimeout(timer);
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep as text
    }

    if (res.status === 429 && attempt < MAX_RETRIES_429) {
      await sleep(Math.max(MIN_INTERVAL_MS, 1500) * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      throw new TikTokApiError(friendlyEnsembleMessage(res.status, body), res.status, body);
    }
    return body as EnsembleHashtagResponse;
  }
}

// キーワード検索の item は実データを aweme_info でラップしている。
// ハッシュタグ検索は item が直接 aweme。両方を吸収する。
function unwrap(item: EnsembleAweme & { aweme_info?: EnsembleAweme }): EnsembleAweme {
  return item.aweme_info ?? item;
}

/**
 * EnsembleData で TikTok を検索し、NormalizedPost[] を返す。
 * mode="keyword"（既定）: /tt/keyword/search でネイティブのキーワード検索に近い広い結果。
 * mode="hashtag"        : /tt/hashtag/posts で #タグのチャレンジ投稿に限定。
 * X(searchTwitterApiIo) / IG(igSearch) と同じ返り値形のドロップイン互換。
 */
export async function searchTikTokEnsemble(
  opts: TikTokSearchOptions
): Promise<NormalizedPost[]> {
  const target = opts.limit ?? 50;
  const maxPages = Math.min(opts.maxPages ?? MAX_PAGES_SAFETY, MAX_PAGES_SAFETY);
  const mode = opts.mode ?? "keyword";
  const since = toUnixSeconds(opts.startTime);
  const until = toUnixSeconds(opts.endTime);
  const collected: NormalizedPost[] = [];
  const seen = new Set<string>();
  const deadline = Date.now() + TIKTOK_BUDGET_MS;

  for (const raw of opts.hashtags) {
    if (Date.now() > deadline) break;
    const word = raw.replace(/^#/, "").trim();
    if (!word) continue;

    const endpoint = mode === "hashtag" ? HASHTAG_POSTS : KEYWORD_SEARCH;
    const params: Record<string, string> =
      mode === "hashtag" ? { name: word } : { name: word, period: "0" };

    let cursor = "";
    for (let page = 0; page < maxPages; page++) {
      if (Date.now() > deadline) break;
      if (page > 0 && MIN_INTERVAL_MS > 0) await sleep(MIN_INTERVAL_MS);
      const res = await fetchPage(endpoint, params, cursor);
      const items = extractAwemes(res);
      if (items.length === 0) break;

      for (const item of items) {
        const a = unwrap(item as EnsembleAweme & { aweme_info?: EnsembleAweme });
        const t = a.create_time;
        if (since !== undefined && t !== undefined && t < since) continue;
        if (until !== undefined && t !== undefined && t > until) continue;
        const post = normalize(a);
        if (!post.externalId || seen.has(post.externalId)) continue;
        if (opts.minLikes && post.likeCount < opts.minLikes) continue;
        // ハッシュタグモードは後段の evaluate が #一致を要求するので、検索語を必ず含めておく
        if (mode === "hashtag" && !post.hashtags.some((h) => h.toLowerCase() === word.toLowerCase())) {
          post.hashtags.unshift(word);
        }
        seen.add(post.externalId);
        collected.push(post);
      }

      if (collected.length >= target) break;
      const next = nextCursorOf(res);
      if (!next || next === cursor) break;
      cursor = next;
    }
    if (collected.length >= target) break;
  }

  return collected.slice(0, target);
}
