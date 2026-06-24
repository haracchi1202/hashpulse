export type Platform = "X" | "INSTAGRAM" | "TIKTOK";

export type SearchFilters = {
  startDate?: string;
  endDate?: string;
  minLikes?: number;
  minFollowers?: number;
  lang?: "ja" | "en";
};

export type NormalizedPost = {
  platform: Platform;
  externalId: string;
  authorExternalId: string;
  authorUsername: string;
  authorDisplayName?: string;
  authorFollowers?: number;
  text: string;
  postedAt: string;
  url: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  hashtags: string[];
};

export type KPI = {
  postCount: number;
  totalLikes: number;
  totalImpressions: number;
  totalRetweets: number;
  totalReplies: number;
  avgER: number;
  avgImpressions: number;
  avgLikes: number;
};

export type InfluencerRow = {
  authorUsername: string;
  authorDisplayName?: string;
  followers: number;
  postCount: number;
  totalLikes: number;
  totalImpressions: number;
  avgER: number;
  /** 代表投稿（最もいいねが多い投稿）の URL。参照記事リンク用 */
  topPostUrl?: string;
  /** 代表投稿のプラットフォーム（X / INSTAGRAM） */
  platform?: string;
};

export type TimeseriesPoint = {
  date: string;
  postCount: number;
  totalLikes: number;
  totalImpressions: number;
  avgER: number;
};

export type CompareItem = {
  searchId: string;
  query: string;
  name?: string;
  platforms: Platform[];
  kpi: KPI;
  timeseries: TimeseriesPoint[];
};

export type APIResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
