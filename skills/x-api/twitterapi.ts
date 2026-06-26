import type { NormalizedPost } from "@/lib/types";
import { XApiError } from "./client";
import type { XSearchOptions } from "./types";

// twitterapi.io = 非公式の X データプロバイダ。
// 公式 v2 と違い /search/all 相当の「全期間アドバンス検索」が使え、7日制限がない。
// 単価 $0.00015/件・月額固定なし。impression(viewCount) も取れる。
// 認証は X-API-Key ヘッダ（公式の Bearer とは別物）。
const BASE = "https://api.twitterapi.io";
const ADVANCED_SEARCH = "/twitter/tweet/advanced_search";

// 暴走防止の安全弁。maxResults に達するか has_next_page=false で先に止まる。
// 速度より網羅性を優先するため大きめ（250ページ）。
const MAX_PAGES_SAFETY = 250;

// 無料枠は「5秒に1リクエスト」の QPS 制限。429 回避のためページ間隔を空ける。
// 有料プランでは TWITTERAPI_IO_MIN_INTERVAL_MS=0 等で短縮可能。
const MIN_INTERVAL_MS = Number(process.env.TWITTERAPI_IO_MIN_INTERVAL_MS ?? 5100);
const MAX_RETRIES_429 = 3;

// twitterapi.io の遅延/ハングで関数全体が 504/タイムアウトするのを防ぐため、
// 1リクエストごとに打ち切る。タイムアウトは collect 側の try/catch が拾い、
// 他媒体（IG/TikTok）の結果は守られる。
const FETCH_TIMEOUT_MS = Number(process.env.X_FETCH_TIMEOUT_MS ?? 20000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TwitterApiIoAuthor {
  id: string;
  userName?: string;
  name?: string;
  followers?: number;
  url?: string;
  isBlueVerified?: boolean;
  profilePicture?: string;
}

interface TwitterApiIoTweet {
  id: string;
  text: string;
  createdAt: string;
  url?: string;
  lang?: string;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  quoteCount?: number;
  viewCount?: number;
  bookmarkCount?: number;
  author?: TwitterApiIoAuthor;
  entities?: {
    hashtags?: { text?: string; tag?: string }[];
  };
}

interface TwitterApiIoSearchResponse {
  tweets?: TwitterApiIoTweet[];
  has_next_page?: boolean;
  next_cursor?: string;
}

function getApiKey(): string {
  const key = process.env.TWITTERAPI_IO_KEY;
  if (!key) {
    throw new XApiError(
      "TWITTERAPI_IO_KEY is not set in environment (X_SEARCH_PROVIDER=twitterapi)",
      500,
      null
    );
  }
  return key;
}

// ISO 8601 → Unix 秒。twitterapi.io の since_time/until_time は Unix 秒のみ対応。
function toUnixSeconds(iso?: string): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  return Math.floor(ms / 1000);
}

// 公式 buildQuery (v2 構文) と違い、twitterapi.io は従来の advanced search 構文。
function buildQuery(opts: XSearchOptions): string {
  const parts = [opts.query];
  if (opts.lang) parts.push(`lang:${opts.lang}`);
  // 既定では RT も含める。除外したい場合のみ excludeRetweets: true を渡す
  if (opts.excludeRetweets === true) parts.push("-filter:retweets");
  const since = toUnixSeconds(opts.startTime);
  const until = toUnixSeconds(opts.endTime);
  if (since !== undefined) parts.push(`since_time:${since}`);
  if (until !== undefined) parts.push(`until_time:${until}`);
  return parts.join(" ");
}

function toIso(createdAt: string): string {
  const ms = Date.parse(createdAt);
  return Number.isNaN(ms) ? createdAt : new Date(ms).toISOString();
}

function normalize(t: TwitterApiIoTweet): NormalizedPost {
  const username = t.author?.userName ?? "unknown";
  return {
    platform: "X",
    externalId: t.id,
    authorExternalId: t.author?.id ?? "",
    authorUsername: username,
    authorDisplayName: t.author?.name,
    authorFollowers: t.author?.followers ?? 0,
    text: t.text,
    postedAt: toIso(t.createdAt),
    url: t.url ?? `https://twitter.com/${username}/status/${t.id}`,
    likeCount: t.likeCount ?? 0,
    retweetCount: t.retweetCount ?? 0,
    replyCount: t.replyCount ?? 0,
    quoteCount: t.quoteCount ?? 0,
    impressionCount: t.viewCount ?? 0,
    hashtags: (t.entities?.hashtags ?? [])
      .map((h) => h.text ?? h.tag)
      .filter((x): x is string => Boolean(x)),
  };
}

async function fetchPage(
  query: string,
  cursor: string
): Promise<TwitterApiIoSearchResponse> {
  const url = new URL(`${BASE}${ADVANCED_SEARCH}`);
  url.searchParams.set("query", query);
  url.searchParams.set("queryType", "Latest");
  if (cursor) url.searchParams.set("cursor", cursor);

  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          "X-API-Key": getApiKey(),
          "User-Agent": "HashPulse/0.1",
        },
        cache: "no-store",
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === "AbortError") {
        throw new XApiError(
          `twitterapi.io リクエストが ${FETCH_TIMEOUT_MS / 1000}秒でタイムアウトしました`,
          0,
          null
        );
      }
      throw e;
    }
    clearTimeout(timer);

    const textBody = await res.text();
    let body: unknown = textBody;
    try {
      body = JSON.parse(textBody);
    } catch {
      // keep as text
    }

    // 429: 無料枠 QPS(5s/req) 超過。間隔を空けてリトライ。
    if (res.status === 429 && attempt < MAX_RETRIES_429) {
      const wait = Math.max(MIN_INTERVAL_MS, 5100);
      console.warn(
        `[twitterapi] 429 received, backing off ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES_429})`
      );
      await sleep(wait);
      continue;
    }

    if (!res.ok) {
      throw new XApiError(
        `twitterapi.io ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
        res.status,
        body
      );
    }
    return body as TwitterApiIoSearchResponse;
  }
}

/**
 * twitterapi.io advanced_search で X を全期間検索する。
 * 公式 searchRecent と同じ NormalizedPost[] を返すドロップイン互換。
 *
 * 注意: ページサイズは固定(~20件/page)。maxResults は「合計取得目安の上限」として扱い、
 * 達したら打ち切る。maxPages(公式の per-page 概念)は使わず、合計件数で制御する。
 */
export async function searchTwitterApiIo(
  opts: XSearchOptions
): Promise<NormalizedPost[]> {
  const query = buildQuery(opts);
  const target = opts.maxResults ?? 100;
  const collected: NormalizedPost[] = [];

  let cursor = "";
  for (let page = 0; page < MAX_PAGES_SAFETY; page++) {
    // 2ページ目以降は QPS 制限回避のため間隔を空ける
    if (page > 0 && MIN_INTERVAL_MS > 0) await sleep(MIN_INTERVAL_MS);
    const res = await fetchPage(query, cursor);
    for (const t of res.tweets ?? []) {
      const post = normalize(t);
      if (opts.minFollowers && (post.authorFollowers ?? 0) < opts.minFollowers)
        continue;
      if (opts.minLikes && post.likeCount < opts.minLikes) continue;
      collected.push(post);
    }
    if (collected.length >= target) break;
    if (!res.has_next_page || !res.next_cursor) break;
    cursor = res.next_cursor;
  }

  return collected.slice(0, target);
}
