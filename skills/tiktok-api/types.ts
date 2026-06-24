// TikTok 検索オプション（X/IG と揃えた共通形）
export interface TikTokSearchOptions {
  /** ハッシュタグ（# は付けても付けなくても可）またはキーワード */
  hashtags: string[];
  /** "keyword"（既定・広いキーワード検索）/ "hashtag"（#タグ限定） */
  mode?: "keyword" | "hashtag";
  /** ISO8601。EnsembleData では days 換算 or クライアント側フィルタに使う */
  startTime?: string;
  endTime?: string;
  minLikes?: number;
  /** 合計取得目安の上限 */
  limit?: number;
}

// EnsembleData /tt/hashtag/posts のレスポンス（必要な部分のみ・防御的に optional）
export interface EnsembleAuthor {
  uid?: string;
  id?: string;
  unique_id?: string;
  nickname?: string;
  follower_count?: number;
}

export interface EnsembleStatistics {
  digg_count?: number; // いいね
  comment_count?: number; // コメント
  share_count?: number; // シェア
  play_count?: number; // 再生数
  collect_count?: number; // 保存
}

export interface EnsembleAweme {
  aweme_id?: string;
  desc?: string;
  create_time?: number; // unix 秒
  statistics?: EnsembleStatistics;
  author?: EnsembleAuthor;
  text_extra?: { hashtag_name?: string }[];
}

// EnsembleData は全体を data でラップし、実際の投稿は data.data に入る:
//   { data: { nextCursor: 20, data: [ ...aweme... ] } }
// 旧形（data が配列 / aweme_list）にも防御的に対応する。
export interface EnsembleDataEnvelope {
  nextCursor?: number | string;
  next_cursor?: number | string;
  data?: EnsembleAweme[];
  aweme_list?: EnsembleAweme[];
}

export interface EnsembleHashtagResponse {
  data?: EnsembleDataEnvelope | EnsembleAweme[];
  aweme_list?: EnsembleAweme[];
  nextCursor?: number | string;
  next_cursor?: number | string;
  units_charged?: number;
}
