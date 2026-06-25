import type { InfluencerRow } from "@/lib/types";

export interface InfluencerPost {
  authorUsername: string;
  authorDisplayName?: string;
  authorFollowers?: number;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  url?: string;
  platform?: string;
}

export type RankBy = "followers" | "er" | "likes" | "impressions";

export function rankInfluencers(
  posts: InfluencerPost[],
  by: RankBy = "er",
  limit = 10
): InfluencerRow[] {
  const byUser = new Map<
    string,
    InfluencerRow & { _erSum: number; _erCount: number; _topLikes: number }
  >();
  for (const p of posts) {
    let row = byUser.get(p.authorUsername);
    if (!row) {
      row = {
        authorUsername: p.authorUsername,
        authorDisplayName: p.authorDisplayName,
        followers: p.authorFollowers ?? 0,
        postCount: 0,
        totalLikes: 0,
        totalImpressions: 0,
        avgER: 0,
        topPostUrl: p.url,
        platform: p.platform,
        _erSum: 0,
        _erCount: 0,
        _topLikes: -1,
      };
      byUser.set(p.authorUsername, row);
    }
    row.postCount++;
    row.totalLikes += p.likeCount;
    row.totalImpressions += p.impressionCount;
    if ((p.authorFollowers ?? 0) > row.followers) {
      row.followers = p.authorFollowers ?? row.followers;
    }
    // 代表投稿 = 最もいいねが多い投稿の URL を保持
    if (p.likeCount > row._topLikes) {
      row._topLikes = p.likeCount;
      row.topPostUrl = p.url ?? row.topPostUrl;
      row.platform = p.platform ?? row.platform;
    }
    const engage = p.likeCount + p.retweetCount + p.replyCount + p.quoteCount;
    const denom =
      p.impressionCount && p.impressionCount > 0
        ? p.impressionCount
        : p.authorFollowers && p.authorFollowers > 0
          ? p.authorFollowers
          : 0;
    if (denom > 0) {
      row._erSum += engage / denom;
      row._erCount++;
    }
  }

  const rows: InfluencerRow[] = Array.from(byUser.values()).map((r) => ({
    authorUsername: r.authorUsername,
    authorDisplayName: r.authorDisplayName,
    followers: r.followers,
    postCount: r.postCount,
    totalLikes: r.totalLikes,
    totalImpressions: r.totalImpressions,
    avgER: r._erCount > 0 ? r._erSum / r._erCount : 0,
    topPostUrl: r.topPostUrl,
    platform: r.platform,
  }));

  rows.sort((a, b) => {
    switch (by) {
      case "followers":
        return b.followers - a.followers;
      case "er":
        return b.avgER - a.avgER;
      case "likes":
        return b.totalLikes - a.totalLikes;
      case "impressions":
        return b.totalImpressions - a.totalImpressions;
    }
  });

  return rows.slice(0, limit);
}
