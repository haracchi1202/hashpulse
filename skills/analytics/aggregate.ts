import type { KPI, Platform } from "@/lib/types";

export interface PostRow {
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  authorFollowers?: number;
}

export interface PlatformKPI {
  /** X（Twitter）だけの集計 */
  x: KPI;
  /** Instagram だけの集計 */
  instagram: KPI;
  /** TikTok だけの集計 */
  tiktok: KPI;
  /** 全プラットフォーム合算 */
  total: KPI;
}

/**
 * 投稿を platform で X / INSTAGRAM / TIKTOK に分けて KPI を集計し、合計も返す。
 * ダッシュボードで「Xでどれくらい・IGでどれくらい・TikTokでどれくらい・合計」を出すために使う。
 */
export function aggregateKPIByPlatform<T extends PostRow & { platform: Platform }>(
  posts: T[]
): PlatformKPI {
  return {
    x: aggregateKPI(posts.filter((p) => p.platform === "X")),
    instagram: aggregateKPI(posts.filter((p) => p.platform === "INSTAGRAM")),
    tiktok: aggregateKPI(posts.filter((p) => p.platform === "TIKTOK")),
    total: aggregateKPI(posts),
  };
}

export function aggregateKPI(posts: PostRow[]): KPI {
  if (posts.length === 0) {
    return {
      postCount: 0,
      totalLikes: 0,
      totalImpressions: 0,
      totalRetweets: 0,
      totalReplies: 0,
      avgER: 0,
      avgImpressions: 0,
      avgLikes: 0,
    };
  }

  let totalLikes = 0;
  let totalImpressions = 0;
  let totalRetweets = 0;
  let totalReplies = 0;
  let erSum = 0;
  let erCount = 0;

  for (const p of posts) {
    totalLikes += p.likeCount;
    totalImpressions += p.impressionCount;
    totalRetweets += p.retweetCount;
    totalReplies += p.replyCount;

    // ER 算出: impression があれば impression ベース、なければ follower ベース
    const engage = p.likeCount + p.retweetCount + p.replyCount + p.quoteCount;
    let denom = 0;
    if (p.impressionCount && p.impressionCount > 0) denom = p.impressionCount;
    else if (p.authorFollowers && p.authorFollowers > 0) denom = p.authorFollowers;

    if (denom > 0) {
      erSum += engage / denom;
      erCount++;
    }
  }

  return {
    postCount: posts.length,
    totalLikes,
    totalImpressions,
    totalRetweets,
    totalReplies,
    avgER: erCount > 0 ? erSum / erCount : 0,
    avgImpressions: totalImpressions / posts.length,
    avgLikes: totalLikes / posts.length,
  };
}
