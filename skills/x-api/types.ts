export interface XTweetMetrics {
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
  impression_count?: number;
}

export interface XTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  lang?: string;
  public_metrics: XTweetMetrics;
  organic_metrics?: XTweetMetrics;
  entities?: {
    hashtags?: { start: number; end: number; tag: string }[];
  };
}

export interface XUser {
  id: string;
  username: string;
  name: string;
  verified?: boolean;
  description?: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
}

export interface XSearchResponse {
  data?: XTweet[];
  includes?: {
    users?: XUser[];
  };
  meta?: {
    newest_id?: string;
    oldest_id?: string;
    result_count: number;
    next_token?: string;
  };
  errors?: { title: string; detail: string }[];
}

export interface XSearchOptions {
  query: string;
  startTime?: string;        // ISO 8601
  endTime?: string;
  maxResults?: number;       // 10-100 per page
  maxPages?: number;         // 何ページまで取りに行くか
  lang?: string;
  excludeRetweets?: boolean;
  minLikes?: number;         // 取得後フィルタ
  minFollowers?: number;     // 取得後フィルタ
}
