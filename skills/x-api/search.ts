import type { NormalizedPost } from "@/lib/types";
import { xFetch } from "./client";
import type { XSearchOptions, XSearchResponse, XUser } from "./types";

// organic_metrics は自分の tweet にしか使えない (Field Authorization Error)
// public_metrics だけで likes/retweets/replies/quotes/impressions が取れる
const TWEET_FIELDS = [
  "id",
  "text",
  "author_id",
  "created_at",
  "lang",
  "public_metrics",
  "entities",
].join(",");

const USER_FIELDS = [
  "id",
  "username",
  "name",
  "verified",
  "description",
  "profile_image_url",
  "public_metrics",
].join(",");

const EXPANSIONS = "author_id";

export async function searchRecent(
  opts: XSearchOptions
): Promise<NormalizedPost[]> {
  const q = buildQuery(opts);
  const maxPages = opts.maxPages ?? 1;
  const collected: NormalizedPost[] = [];

  let nextToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const res = await xFetch<XSearchResponse>("/tweets/search/recent", {
      query: q,
      max_results: Math.min(Math.max(opts.maxResults ?? 50, 10), 100),
      start_time: opts.startTime,
      end_time: opts.endTime,
      "tweet.fields": TWEET_FIELDS,
      "user.fields": USER_FIELDS,
      expansions: EXPANSIONS,
      next_token: nextToken,
    });

    const tweets = res.data ?? [];
    const userById = new Map<string, XUser>();
    for (const u of res.includes?.users ?? []) {
      userById.set(u.id, u);
    }

    for (const t of tweets) {
      const author = userById.get(t.author_id);
      const followers = author?.public_metrics?.followers_count ?? 0;
      if (opts.minFollowers && followers < opts.minFollowers) continue;
      const metrics = t.organic_metrics ?? t.public_metrics;
      if (opts.minLikes && metrics.like_count < opts.minLikes) continue;

      collected.push({
        platform: "X",
        externalId: t.id,
        authorExternalId: t.author_id,
        authorUsername: author?.username ?? t.author_id,
        authorDisplayName: author?.name,
        authorFollowers: followers,
        text: t.text,
        postedAt: t.created_at,
        url: `https://twitter.com/${author?.username ?? "i"}/status/${t.id}`,
        likeCount: metrics.like_count ?? 0,
        retweetCount: metrics.retweet_count ?? 0,
        replyCount: metrics.reply_count ?? 0,
        quoteCount: metrics.quote_count ?? 0,
        impressionCount: metrics.impression_count ?? 0,
        hashtags: (t.entities?.hashtags ?? []).map((h) => h.tag),
      });
    }

    nextToken = res.meta?.next_token;
    if (!nextToken) break;
  }

  return collected;
}

function buildQuery(opts: XSearchOptions): string {
  const parts = [opts.query];
  if (opts.lang) parts.push(`lang:${opts.lang}`);
  if (opts.excludeRetweets !== false) parts.push("-is:retweet");
  return parts.join(" ");
}
