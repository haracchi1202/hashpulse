export interface IGMedia {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

export interface IGSearchOptions {
  hashtags: string[];     // 検索したいタグ群 (# なし)
  startTime?: string;
  endTime?: string;
  minLikes?: number;
  limit?: number;
  /** タグごとのページ送り上限。時間制限のある環境（Vercel）で打ち切られないよう collect から制限する。 */
  maxPages?: number;
}
