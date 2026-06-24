import type { NormalizedPost } from "@/lib/types";
import type { IGSearchOptions, IGMedia } from "./types";

// IG_USE_MOCK !== "false" の場合は mock を返す
const USE_MOCK = process.env.IG_USE_MOCK !== "false";
const GRAPH_BASE = "https://graph.facebook.com/v22.0";

export async function igSearch(opts: IGSearchOptions): Promise<NormalizedPost[]> {
  if (USE_MOCK) {
    return mockIGSearch(opts);
  }
  return realIGSearch(opts);
}

// ----- Mock -----
function mockIGSearch(opts: IGSearchOptions): NormalizedPost[] {
  const limit = opts.limit ?? 20;
  const now = Date.now();
  return Array.from({ length: limit }, (_, i) => {
    const ts = new Date(now - i * 3600_000).toISOString();
    const tag = opts.hashtags[i % opts.hashtags.length] ?? "ig";
    return {
      platform: "INSTAGRAM" as const,
      externalId: `mock-ig-${tag}-${i}`,
      authorExternalId: `mock-user-${i % 5}`,
      authorUsername: `mock_user_${i % 5}`,
      authorDisplayName: `Mock Creator ${i % 5}`,
      authorFollowers: 5000 + i * 200,
      text: `[MOCK] ${tag} に関する投稿サンプル #${tag}`,
      postedAt: ts,
      url: `https://instagram.com/p/mock-${i}`,
      likeCount: 100 + i * 13,
      retweetCount: 0,
      replyCount: 5 + i,
      quoteCount: 0,
      impressionCount: 0,
      hashtags: [tag],
    };
  }).filter((p) => !opts.minLikes || p.likeCount >= opts.minLikes);
}

// ----- Real Implementation -----
//
// Instagram Graph API (Hashtag Search):
//   1) GET /ig_hashtag_search?user_id={IG_USER_ID}&q={tag}  → hashtag_id
//   2) GET /{hashtag_id}/recent_media?user_id={IG_USER_ID}&fields=id,caption,media_type,permalink,timestamp,like_count,comments_count&limit=...
//   3) (optional) GET /{ig-user-id}?fields=username
//
// 必要な権限スコープ: instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement
// IG_USER_ID は IG Business/Creator アカウントの Graph API ID (Page と紐づいたもの)
async function realIGSearch(opts: IGSearchOptions): Promise<NormalizedPost[]> {
  const token = process.env.IG_ACCESS_TOKEN;
  const userId = process.env.IG_USER_ID;
  if (!token || !userId) {
    throw new IGApiError("IG_ACCESS_TOKEN / IG_USER_ID is required when IG_USE_MOCK=false", 0);
  }

  // 取得総数の上限。1ページのサイズ(25)とは別。網羅性優先で大きく許容する。
  const limit = Math.max(opts.limit ?? 25, 1);
  const collected: NormalizedPost[] = [];

  for (const rawTag of opts.hashtags) {
    const tag = rawTag.replace(/^#/, "");
    if (!tag) continue;

    // 1) hashtag_id を取得
    const hashtagId = await resolveHashtagId(tag, userId, token);
    if (!hashtagId) continue;

    // 2) top_media（人気・全期間サンプル）と recent_media（直近24h）の両方を取得して統合。
    //    recent_media だけだと直近に投稿が無いタグは0件になるため top_media を併用する。
    for (const edge of ["top_media", "recent_media"] as const) {
      let url: URL | null = new URL(`${GRAPH_BASE}/${hashtagId}/${edge}`);
      url.searchParams.set("user_id", userId);
      // caption は含めない。含めると top_media の深いページで必ず
      // "Please reduce the amount of data" エラーになり ~50件で打ち切られるため。
      // caption 無しなら数百件まで深くページングでき、件数/いいね/コメント/再生を
      // 正確に集計できる（網羅性優先。代わりに IG 投稿の本文テキストは取得しない）。
      url.searchParams.set("fields", "id,media_type,permalink,timestamp,like_count,comments_count");
      url.searchParams.set("limit", String(Math.min(limit, 25)));
      url.searchParams.set("access_token", token);

      let collectedForEdge = 0;
      while (url && collectedForEdge < limit) {
        const res = await fetch(url.toString(), { cache: "no-store" });
        const body = await safeJson(res);
        if (!res.ok) {
          // top_media は大量データで一時的にエラーになることがある。
          // 片方の edge が失敗してももう片方は試したいので致命にせず打ち切る。
          break;
        }
        const data = (body as { data?: IGMedia[]; paging?: { next?: string } });
        const items = data.data ?? [];
        for (const m of items) {
          if (collectedForEdge >= limit) break;
          const startMs = opts.startTime ? Date.parse(opts.startTime) : 0;
          const endMs = opts.endTime ? Date.parse(opts.endTime) : Infinity;
          const ts = Date.parse(m.timestamp);
          if (ts < startMs || ts > endMs) continue;

          const likes = m.like_count ?? 0;
          if (opts.minLikes && likes < opts.minLikes) continue;

          collected.push(normalize(m, tag));
          collectedForEdge++;
        }
        const next = data.paging?.next;
        url = next && items.length > 0 ? new URL(next) : null;
      }
    }
  }

  // 重複 (複数タグで同じ投稿) を externalId で除去
  const dedup = new Map<string, NormalizedPost>();
  for (const p of collected) {
    if (!dedup.has(p.externalId)) dedup.set(p.externalId, p);
  }
  return Array.from(dedup.values());
}

async function resolveHashtagId(
  tag: string,
  userId: string,
  token: string
): Promise<string | null> {
  const url = new URL(`${GRAPH_BASE}/ig_hashtag_search`);
  url.searchParams.set("user_id", userId);
  url.searchParams.set("q", tag);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const body = await safeJson(res);
  if (!res.ok) {
    throw new IGApiError(
      `IG hashtag_search ${res.status}: ${JSON.stringify(body).slice(0, 300)}`,
      res.status,
      body
    );
  }
  const arr = (body as { data?: { id: string }[] }).data ?? [];
  return arr[0]?.id ?? null;
}

function normalize(m: IGMedia, sourceTag: string): NormalizedPost {
  const text = m.caption ?? "";
  // caption から #tag を抽出 (英数字 + ひらがな/カタカナ/漢字 + 半角アンダースコア)
  const hashtagMatches = text.match(/#([A-Za-z0-9_぀-ヿ㐀-鿿]+)/g) ?? [];
  const hashtags = hashtagMatches.map((h) => h.slice(1).toLowerCase());
  if (!hashtags.includes(sourceTag.toLowerCase())) {
    hashtags.unshift(sourceTag.toLowerCase());
  }

  return {
    platform: "INSTAGRAM",
    externalId: m.id,
    authorExternalId: m.id, // hashtag search では owner_id が取れない (権限制約)
    authorUsername: "unknown_ig",
    authorDisplayName: undefined,
    authorFollowers: undefined,
    text,
    postedAt: m.timestamp,
    url: m.permalink,
    likeCount: m.like_count ?? 0,
    retweetCount: 0,
    replyCount: m.comments_count ?? 0,
    quoteCount: 0,
    impressionCount: 0, // 他人投稿の IMP は取得不可
    hashtags,
  };
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class IGApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = "IGApiError";
  }
}
