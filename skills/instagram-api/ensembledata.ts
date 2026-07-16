import type { NormalizedPost } from "@/lib/types";
import type { IGSearchOptions } from "./types";

// EnsembleData = Instagram データの第三者プロバイダ。
// 公式 Graph API の Hashtag Search と違い、Reels(動画) も含めてハッシュタグ投稿を取得でき、
// 投稿者の username / followers も取れる（公式は他人投稿で取得不可）。
// TikTok の ensembledata.ts と同じ「プロバイダ差し込み」構造で実装している。
// 認証は token クエリパラメータ（公式 API ではない従量課金サービス）。
const BASE = "https://ensembledata.com/apis";
const HASHTAG_POSTS = "/instagram/hashtag/posts";

// 暴走防止の安全弁。limit に達するか nextCursor が無くなれば先に止まる。
const MAX_PAGES_SAFETY = 250;
// 連続リクエストの間隔（レート制御）。
const MIN_INTERVAL_MS = Number(process.env.IG_MIN_INTERVAL_MS ?? 1200);
const MAX_RETRIES_429 = 3;

// EnsembleData の遅延/ハングで関数全体が 504/タイムアウトするのを防ぐため、
// 1リクエストごとに打ち切る。タイムアウトは collect 側の try/catch が拾い、
// 他媒体（X/TikTok）の結果は守られる。
const FETCH_TIMEOUT_MS = Number(process.env.IG_FETCH_TIMEOUT_MS ?? 20000);
// IG 収集全体の時間予算（TikTok の TIKTOK_BUDGET_MS と対）。超過時は取れた分を返す。
const IG_BUDGET_MS = Number(process.env.IG_BUDGET_MS ?? 35000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class IGEnsembleError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
    this.name = "IGEnsembleError";
  }
}

// EnsembleData IG ハッシュタグ投稿は GraphQL 形式の node でラップされている。
// __typename: GraphImage | GraphVideo(=Reels含む動画) | GraphSidecar(複数枚)
interface IGNode {
  __typename?: string;
  id?: string;
  shortcode?: string;
  is_video?: boolean;
  // 動画/Reels の再生数。EnsembleData は play_count に入れて返す（video_view_count は静止画では null）。
  play_count?: number | null;
  video_view_count?: number | null;
  taken_at_timestamp?: number;
  display_url?: string;
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] };
  edge_media_to_comment?: { count?: number };
  edge_liked_by?: { count?: number };
  edge_media_preview_like?: { count?: number };
  owner?: {
    id?: string;
    username?: string;
    full_name?: string;
    followers?: number;
  };
}

interface IGHashtagResponse {
  data?: {
    top_posts?: { node?: IGNode }[];
    recent_posts?: { node?: IGNode }[];
    nextCursor?: string | null;
    next_cursor?: string | null;
  };
}

function getToken(): string {
  const token = process.env.ENSEMBLEDATA_TOKEN;
  if (!token) {
    throw new IGEnsembleError(
      "ENSEMBLEDATA_TOKEN is not set in environment (IG_PROVIDER=ensembledata)",
      500
    );
  }
  return token;
}

// EnsembleData の独自ステータスコードを、ダッシュボードにそのまま出せる日本語に翻訳する。
// TikTok 側 (tiktok-api/ensembledata.ts) と同じ方針。
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
  return `EnsembleData IG ${status}: ${detail}`;
}

function toUnixSeconds(value?: string): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

// レスポンスの top_posts + recent_posts を node 配列として平坦化する。
function extractNodes(res: IGHashtagResponse): IGNode[] {
  const d = res.data;
  if (!d) return [];
  const wrap = [...(d.top_posts ?? []), ...(d.recent_posts ?? [])];
  return wrap
    .map((w) => w?.node)
    .filter((n): n is IGNode => Boolean(n));
}

function nextCursorOf(res: IGHashtagResponse): string | undefined {
  const c = res.data?.nextCursor ?? res.data?.next_cursor;
  return c === undefined || c === null ? undefined : String(c);
}

function captionOf(node: IGNode): string {
  return node.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";
}

function normalize(node: IGNode, sourceTag: string): NormalizedPost {
  const text = captionOf(node);
  const owner = node.owner ?? {};
  const username = owner.username ?? "unknown_ig";
  const likes = node.edge_media_preview_like?.count ?? node.edge_liked_by?.count ?? 0;
  const comments = node.edge_media_to_comment?.count ?? 0;
  // 動画(Reels)は再生数を「表示数」として格納。画像投稿は再生数が無いので 0。
  const views = node.play_count ?? node.video_view_count ?? 0;
  const ts = node.taken_at_timestamp
    ? new Date(node.taken_at_timestamp * 1000).toISOString()
    : "";

  // caption から #tag を抽出（英数字 + ひらがな/カタカナ/漢字 + 半角アンダースコア）
  const hashtags = (text.match(/#([A-Za-z0-9_぀-ヿ㐀-鿿]+)/g) ?? []).map((h) =>
    h.slice(1).toLowerCase()
  );
  // 後処理 evaluate（タグ集合で AND/NOT 判定）が検索タグの一致を要求するので必ず含めておく
  if (!hashtags.includes(sourceTag.toLowerCase())) {
    hashtags.unshift(sourceTag.toLowerCase());
  }

  return {
    platform: "INSTAGRAM",
    externalId: node.id ?? node.shortcode ?? "",
    authorExternalId: owner.id ?? "",
    authorUsername: username,
    authorDisplayName: owner.full_name,
    authorFollowers: owner.followers ?? 0,
    text,
    postedAt: ts,
    url: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : "",
    likeCount: likes,
    retweetCount: 0,
    replyCount: comments,
    quoteCount: 0,
    impressionCount: views,
    hashtags,
  };
}

async function fetchPage(
  tag: string,
  cursor: string
): Promise<IGHashtagResponse> {
  const url = new URL(`${BASE}${HASHTAG_POSTS}`);
  url.searchParams.set("name", tag);
  url.searchParams.set("get_author_info", "true");
  url.searchParams.set("token", getToken());
  if (cursor) url.searchParams.set("cursor", cursor);

  for (let attempt = 0; ; attempt++) {
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
        throw new IGEnsembleError(
          `EnsembleData IG リクエストが ${FETCH_TIMEOUT_MS / 1000}秒でタイムアウトしました`,
          0
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

    if (res.status === 429 && attempt < MAX_RETRIES_429) {
      await sleep(Math.max(MIN_INTERVAL_MS, 1500) * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      throw new IGEnsembleError(friendlyEnsembleMessage(res.status, body), res.status, body);
    }
    return body as IGHashtagResponse;
  }
}

/**
 * EnsembleData で Instagram のハッシュタグ投稿を検索し、NormalizedPost[] を返す。
 * 公式 igSearch（client.ts）と同じ返り値形のドロップイン互換。
 * 公式 Graph API と違い Reels(動画) を含み、投稿者の username/followers も取得できる。
 */
export async function igSearchEnsemble(
  opts: IGSearchOptions
): Promise<NormalizedPost[]> {
  const target = opts.limit ?? 50;
  const maxPages = Math.min(opts.maxPages ?? MAX_PAGES_SAFETY, MAX_PAGES_SAFETY);
  const since = toUnixSeconds(opts.startTime);
  const until = toUnixSeconds(opts.endTime);
  const collected: NormalizedPost[] = [];
  const seen = new Set<string>();
  // TikTok と同様、時間制限のある環境で確実に打ち切るための内部予算。
  // ここで止まった分も collected として返す（部分結果を捨てない）。
  const deadline = Date.now() + IG_BUDGET_MS;

  for (const raw of opts.hashtags) {
    if (Date.now() > deadline) break;
    const tag = raw.replace(/^#/, "").trim();
    if (!tag) continue;

    let cursor = "";
    for (let page = 0; page < maxPages; page++) {
      if (Date.now() > deadline) break;
      if (page > 0 && MIN_INTERVAL_MS > 0) await sleep(MIN_INTERVAL_MS);
      const res = await fetchPage(tag, cursor);
      const nodes = extractNodes(res);
      if (nodes.length === 0) break;

      for (const node of nodes) {
        const t = node.taken_at_timestamp;
        if (since !== undefined && t !== undefined && t < since) continue;
        if (until !== undefined && t !== undefined && t > until) continue;
        const post = normalize(node, tag);
        if (!post.externalId || seen.has(post.externalId)) continue;
        if (opts.minLikes && post.likeCount < opts.minLikes) continue;
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
