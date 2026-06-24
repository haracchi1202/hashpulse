// コメント（X=リプライ / TikTok・IG=コメント）収集。反響分析の素材を集める。
// 各 Post の externalId を使い、プラットフォーム別 API でコメント本文を取得して正規化する。
// API コスト管理は呼び出し側（上位 N 投稿に絞る）に委ねる。

export interface NormalizedComment {
  platform: "X" | "INSTAGRAM" | "TIKTOK";
  externalId: string;
  text: string;
  authorUsername?: string;
  likeCount: number;
  postedAt?: string; // ISO
}

export interface CommentTarget {
  postId: string; // 自 DB の Post.id
  platform: string; // "X" | "INSTAGRAM" | "TIKTOK"
  externalId: string; // tweet_id / aweme_id / media_id
}

export class CommentApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "CommentApiError";
  }
}

const ED_BASE = "https://ensembledata.com/apis";
const TWAPI_BASE = "https://api.twitterapi.io";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function s(v: unknown): string {
  return v == null ? "" : String(v);
}
function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// ---- X (twitterapi.io) replies ----
interface TwApiTweet {
  id?: string;
  text?: string;
  createdAt?: string;
  likeCount?: number;
  author?: { userName?: string };
}

async function fetchXReplies(tweetId: string, limit: number): Promise<NormalizedComment[]> {
  const key = process.env.TWITTERAPI_IO_KEY;
  if (!key) throw new CommentApiError("TWITTERAPI_IO_KEY is not set", 500);
  const out: NormalizedComment[] = [];
  let cursor = "";
  const interval = Number(process.env.TWITTERAPI_IO_MIN_INTERVAL_MS ?? 5100);
  for (let page = 0; page < 50 && out.length < limit; page++) {
    if (page > 0 && interval > 0) await sleep(interval);
    const url = new URL(`${TWAPI_BASE}/twitter/tweet/replies`);
    url.searchParams.set("tweetId", tweetId);
    if (cursor) url.searchParams.set("cursor", cursor);

    // 429（QPS 制限）は一時的なのでバックオフして再試行する。
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(url.toString(), {
        headers: { "X-API-Key": key, "User-Agent": "HashPulse/0.1" },
        cache: "no-store",
      });
      if (res.status === 429 && attempt < 3) {
        await sleep(Math.max(interval, 5100) * (attempt + 1));
        continue;
      }
      break;
    }
    const body = (await res.json().catch(() => ({}))) as {
      tweets?: TwApiTweet[];
      has_next_page?: boolean;
      next_cursor?: string;
    };
    if (!res.ok) throw new CommentApiError(`twitterapi.io ${res.status}`, res.status);
    for (const t of body.tweets ?? []) {
      if (!t.id) continue;
      out.push({
        platform: "X",
        externalId: s(t.id),
        text: s(t.text),
        authorUsername: t.author?.userName,
        likeCount: n(t.likeCount),
        postedAt: t.createdAt ? new Date(t.createdAt).toISOString() : undefined,
      });
    }
    if (!body.has_next_page || !body.next_cursor) break;
    cursor = body.next_cursor;
  }
  return out.slice(0, limit);
}

// ---- EnsembleData（TikTok / Instagram）共通の防御的取得 ----
function edToken(): string {
  const t = process.env.ENSEMBLEDATA_TOKEN;
  if (!t) throw new CommentApiError("ENSEMBLEDATA_TOKEN is not set", 500);
  return t;
}

// レスポンスの揺れを吸収してコメント配列を取り出す（data.comments / data.data / comments 等）。
function extractComments(body: unknown): Record<string, unknown>[] {
  const b = body as Record<string, unknown>;
  const d = (b?.data ?? b) as Record<string, unknown>;
  const cand =
    (Array.isArray(d?.comments) && d.comments) ||
    (Array.isArray(d?.data) && d.data) ||
    (Array.isArray((b as Record<string, unknown>)?.comments) && (b as Record<string, unknown>).comments) ||
    [];
  return (cand as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
}

async function edGet(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${ED_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("token", edToken());
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "HashPulse/0.1" },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (body as { detail?: string })?.detail ?? "";
    throw new CommentApiError(`EnsembleData ${res.status}: ${detail}`.trim(), res.status);
  }
  return body;
}

// TikTok コメント: text, digg_count, user.unique_id/nickname, cid, create_time（揺れに防御的）
async function fetchTikTokComments(awemeId: string, limit: number): Promise<NormalizedComment[]> {
  const body = await edGet("/tt/post/comments", { aweme_id: awemeId, cursor: "0" });
  const out: NormalizedComment[] = [];
  for (const c of extractComments(body)) {
    const text = s(c.text ?? c.comment ?? "");
    const id = s(c.cid ?? c.id ?? c.comment_id ?? "");
    if (!id || !text) continue;
    const user = (c.user ?? {}) as Record<string, unknown>;
    out.push({
      platform: "TIKTOK",
      externalId: id,
      text,
      authorUsername: s(user.unique_id ?? user.nickname ?? "") || undefined,
      likeCount: n(c.digg_count ?? c.like_count),
      postedAt: c.create_time ? new Date(n(c.create_time) * 1000).toISOString() : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// IG コメント: text, comment_like_count, user.username, pk, created_at（揺れに防御的）
async function fetchInstagramComments(mediaId: string, limit: number): Promise<NormalizedComment[]> {
  const body = await edGet("/instagram/post/comments", { media_id: mediaId, cursor: "0" });
  const out: NormalizedComment[] = [];
  for (const c of extractComments(body)) {
    const text = s(c.text ?? c.comment ?? "");
    const id = s(c.pk ?? c.id ?? c.comment_id ?? "");
    if (!id || !text) continue;
    const user = (c.user ?? {}) as Record<string, unknown>;
    out.push({
      platform: "INSTAGRAM",
      externalId: id,
      text,
      authorUsername: s(user.username ?? "") || undefined,
      likeCount: n(c.comment_like_count ?? c.like_count),
      postedAt: c.created_at ? new Date(n(c.created_at) * 1000).toISOString() : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** 1投稿のコメントをプラットフォーム別に取得する。 */
export async function fetchCommentsFor(
  target: CommentTarget,
  perPost: number
): Promise<NormalizedComment[]> {
  switch (target.platform) {
    case "X":
      return fetchXReplies(target.externalId, perPost);
    case "TIKTOK":
      return fetchTikTokComments(target.externalId, perPost);
    case "INSTAGRAM":
      return fetchInstagramComments(target.externalId, perPost);
    default:
      return [];
  }
}

export interface CollectCommentsResult {
  byPostId: Map<string, NormalizedComment[]>;
  errors: string[];
}

/**
 * 複数投稿のコメントを収集する。targets は呼び出し側で上位 N に絞っておくこと（コスト管理）。
 * プラットフォーム単位の失敗は errors に積んで続行する（レート上限 495 等）。
 */
export async function collectComments(
  targets: CommentTarget[],
  opts: { perPost?: number } = {}
): Promise<CollectCommentsResult> {
  const perPost = opts.perPost ?? 30;
  const byPostId = new Map<string, NormalizedComment[]>();
  const errors: string[] = [];
  // 日次上限(495)に達した媒体は以降スキップ（無駄打ち防止）。429 は provider 側でリトライ済み。
  const deadPlatforms = new Set<string>();
  let processed = 0;

  for (const t of targets) {
    if (deadPlatforms.has(t.platform)) continue;
    // 連続呼び出しの QPS 制限を避けるため、2件目以降は少し間隔を空ける。
    if (processed > 0) await sleep(t.platform === "X" ? 5100 : 1200);
    processed++;
    try {
      const comments = await fetchCommentsFor(t, perPost);
      if (comments.length) byPostId.set(t.postId, comments);
    } catch (e) {
      const msg = `${labelOf(t.platform)} comments: ${(e as Error).message}`;
      if (!errors.includes(msg)) errors.push(msg);
      if ((e as CommentApiError).status === 495) deadPlatforms.add(t.platform);
    }
  }
  return { byPostId, errors };
}

function labelOf(p: string): string {
  return p === "X" ? "X" : p === "INSTAGRAM" ? "Instagram" : p === "TIKTOK" ? "TikTok" : p;
}
