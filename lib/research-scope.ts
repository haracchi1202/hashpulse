// 各 SNS のリサーチ（収集）範囲と対象期間。ランディングページとダッシュボードで共有する。
// X はデフォルトで非公式プロバイダ(twitterapi.io)を使い全期間を対象とする。
export interface ResearchScope {
  platform: string;
  period: string;
  notes: string[];
}

export const RESEARCH_SCOPE: ResearchScope[] = [
  {
    platform: "X (Twitter)",
    period: "全期間",
    notes: [
      "キーワード + #タグ（AND / OR / NOT）",
      "フレーズは完全一致で抽出",
      "リツイートは除外",
      "いいね/RT/返信/引用/表示数を取得",
    ],
  },
  {
    platform: "Instagram",
    period: "人気 + 最新",
    notes: [
      "ハッシュタグ検索（日付範囲の指定は不可）",
      "人気投稿と直近投稿を取得（全期間の網羅ではない）",
      "Reels（ショート動画）も対象",
      "投稿者・本文・再生数も取得",
    ],
  },
  {
    platform: "TikTok",
    period: "全期間",
    notes: [
      "キーワード / ハッシュタグ検索",
      "ショート動画が対象",
      "フレーズは完全一致で抽出",
      "再生/いいね/シェア/保存/コメントを取得",
    ],
  },
];
