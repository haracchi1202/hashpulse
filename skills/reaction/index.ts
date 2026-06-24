// 反響評価（センチメント＋情緒タグ＋トピック分類）。
// SNS反響リサーチ (UGC Intelligence Platform) の backend/services/classify.py を
// TypeScript に移植し、HashPulse の投稿（本文）に対する反響レポートを生成する。
// ルールベースのため API キー不要・高速・再現的。将来コメント本文が収集できれば同じ関数で評価できる。

export type Polarity = "positive" | "negative" | "neutral";

/** 反響分析の入力（投稿1件）。Post / NormalizedPost のサブセット。 */
export interface ReactionInput {
  id: string;
  text: string;
  platform: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  url: string;
  authorUsername: string;
}

export interface ClassifiedPost extends ReactionInput {
  polarity: Polarity;
  emotions: string[];
  topics: string[];
  engagement: number;
}

interface Dist {
  tag: string;
  count: number;
  pct: number;
}

export interface ReactionReport {
  total: number;
  engagement: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    impressions: number;
    total: number;
  };
  hasImpressions: boolean;
  polarity: Record<Polarity, number>;
  polarityPct: Record<Polarity, number>;
  emotions: Dist[];
  topics: Dist[];
  byPlatform: {
    platform: string;
    count: number;
    pct: number;
    positive: number;
    negative: number;
    neutral: number;
  }[];
  insights: string[];
  topPositive: ClassifiedPost[];
  topNegative: ClassifiedPost[];
  topEngaged: ClassifiedPost[];
}

// ---- 分類ルール（classify.py 由来。一般ハッシュタグでも効くよう汎用語を加味） ----

const TOPIC_RULES: [string, RegExp][] = [
  ["交換募集", /交換|譲渡|お譲り|トレード|買取|求：|求\)/],
  ["再販希望", /再販|売り切れ|売切|完売|買えなかった|また欲しい|欲しかった|入手困難/],
  ["開封報告", /開封|中身|出た[!！]|引いた|当たった|ランダム/],
  ["購入報告", /買った|購入|届いた|ゲット|お迎え|買っちゃ|買ってしま|戦利品/],
  ["イベント参加", /会場|現地|イベント|参戦|ポップアップ|pop\s*up|限定|コラボ/i],
  ["感謝", /ありがとう|もらった|プレゼント|頂いた|いただいた/],
  ["コレクション", /コンプ|集め|飾る|飾っ|並べ|コレクション/],
  ["レビュー", /クオリティ|高品質|品質|想像以上|レビュー|おすすめ|レポ/],
];

const EMOTION_RULES: [string, RegExp][] = [
  ["かわいい", /かわい|かわちい|可愛|かわよ|尊い|きゃわ/],
  ["欲しい", /欲しい|ほちい|ほしい|お迎えしたい/],
  ["高い", /高い|高すぎ|お高い/],
  ["安い", /安い|100均|百均|お手頃|プチプラ/],
  ["品質が良い", /クオリティ|高品質|想像以上|丁寧|よくできて/],
  ["品質が悪い", /品質悪|雑な|チープ|安っぽい|不良品/],
  ["再販希望", /再販|また欲しい/],
  ["売り切れ", /売り切れ|売切|完売|買えなかった/],
  ["レア", /レア|シークレット|激レア/],
  ["転売", /転売/],
  ["感動", /感動|泣いた|エモ|神回|最高すぎ/],
];

const NEG = /高すぎ|品質悪|残念|最悪|がっかり|許せない|ひどい|不快|萎え|炎上|嫌い|微妙|悲し|怒/;
const POS = /かわい|可愛|嬉し|うれし|最高|好き|満足|よかった|良かった|ありがとう|尊い|幸せ|神|お迎え|めっちゃいい|楽しい|感動|おすすめ/;

/** 1投稿の本文から topics / polarity / emotions を判定する（classify.py 移植）。 */
export function classify(body: string): {
  polarity: Polarity;
  emotions: string[];
  topics: string[];
} {
  const b = body || "";
  const topics = TOPIC_RULES.filter(([, rx]) => rx.test(b)).map(([l]) => l);
  const emotions = EMOTION_RULES.filter(([, rx]) => rx.test(b)).map(([e]) => e);

  const demand = emotions.some((e) => e === "再販希望" || e === "売り切れ");
  let polarity: Polarity;
  if (NEG.test(b)) {
    polarity = "negative";
  } else if (
    POS.test(b) ||
    demand ||
    emotions.some((e) => ["かわいい", "欲しい", "品質が良い", "レア", "感動"].includes(e))
  ) {
    // 再販希望/売り切れは「需要が強い好材料」= positive 寄り（参照元の設計に準拠）
    polarity = "positive";
  } else {
    polarity = "neutral";
  }

  return { polarity, emotions, topics: topics.length ? topics : ["その他"] };
}

function dist(counter: Map<string, number>, total: number): Dist[] {
  return Array.from(counter.entries())
    .map(([tag, count]) => ({ tag, count, pct: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

function buildInsights(report: Omit<ReactionReport, "insights">): string[] {
  const out: string[] = [];
  const { total, polarityPct, emotions, topics, engagement, hasImpressions } = report;
  if (total === 0) return ["分析対象の投稿がありません。"];

  const posPct = Math.round(polarityPct.positive * 100);
  const negPct = Math.round(polarityPct.negative * 100);
  out.push(
    `全 ${total} 投稿のうちポジティブ ${posPct}% / ネガティブ ${negPct}%。` +
      (posPct >= 60
        ? "好意的な反響が中心で、話題化に向いた素材です。"
        : negPct >= 30
          ? "否定的な反応が一定数あり、文脈の確認が必要です。"
          : "賛否が混在しています。")
  );

  if (emotions[0]) {
    out.push(
      `最も多い情緒は「${emotions[0].tag}」（${emotions[0].count}件）。` +
        (emotions[1] ? `次いで「${emotions[1].tag}」「${emotions[2]?.tag ?? ""}」。` : "")
    );
  }

  const demand = emotions
    .filter((e) => ["再販希望", "売り切れ", "欲しい"].includes(e.tag))
    .reduce((s, e) => s + e.count, 0);
  if (demand > 0) {
    out.push(`「欲しい/再販希望/売り切れ」系が計 ${demand} 件 — 需要が強い好材料です。`);
  }

  const neg = emotions.filter((e) => ["高い", "品質が悪い", "転売"].includes(e.tag));
  if (neg.length) {
    out.push(`懸念材料: ${neg.map((e) => `${e.tag}(${e.count})`).join(" / ")} に言及あり。`);
  }

  if (topics[0]) {
    out.push(`投稿の傾向は「${topics[0].tag}」が最多（${topics[0].count}件）。`);
  }

  out.push(
    `総エンゲージメント ${engagement.total.toLocaleString()}` +
      (hasImpressions
        ? `・総インプレッション ${engagement.impressions.toLocaleString()}。`
        : "（インプレッションは一部ソース未取得）。")
  );

  return out;
}

/** 投稿群を分類・集計して反響レポートを返す。 */
export function analyzeReactions(posts: ReactionInput[]): ReactionReport {
  const classified: ClassifiedPost[] = posts.map((p) => {
    const c = classify(p.text);
    const engagement = p.likeCount + p.retweetCount + p.replyCount + p.quoteCount;
    return { ...p, ...c, engagement };
  });

  const total = classified.length;
  const polarity: Record<Polarity, number> = { positive: 0, negative: 0, neutral: 0 };
  const emoCounter = new Map<string, number>();
  const topicCounter = new Map<string, number>();
  const platformMap = new Map<
    string,
    { count: number; positive: number; negative: number; neutral: number }
  >();
  const eng = { likes: 0, retweets: 0, replies: 0, quotes: 0, impressions: 0, total: 0 };

  for (const p of classified) {
    polarity[p.polarity]++;
    for (const e of p.emotions) emoCounter.set(e, (emoCounter.get(e) ?? 0) + 1);
    for (const t of p.topics) topicCounter.set(t, (topicCounter.get(t) ?? 0) + 1);
    eng.likes += p.likeCount;
    eng.retweets += p.retweetCount;
    eng.replies += p.replyCount;
    eng.quotes += p.quoteCount;
    eng.impressions += p.impressionCount;
    eng.total += p.engagement;

    const pf = platformMap.get(p.platform) ?? { count: 0, positive: 0, negative: 0, neutral: 0 };
    pf.count++;
    pf[p.polarity]++;
    platformMap.set(p.platform, pf);
  }

  const polarityPct: Record<Polarity, number> = {
    positive: total ? polarity.positive / total : 0,
    negative: total ? polarity.negative / total : 0,
    neutral: total ? polarity.neutral / total : 0,
  };

  const byPlatform = Array.from(platformMap.entries())
    .map(([platform, v]) => ({ platform, pct: total ? v.count / total : 0, ...v }))
    .sort((a, b) => b.count - a.count);

  const base: Omit<ReactionReport, "insights"> = {
    total,
    engagement: eng,
    hasImpressions: eng.impressions > 0,
    polarity,
    polarityPct,
    emotions: dist(emoCounter, total),
    topics: dist(topicCounter, total),
    byPlatform,
    topPositive: classified
      .filter((p) => p.polarity === "positive")
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5),
    topNegative: classified
      .filter((p) => p.polarity === "negative")
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5),
    topEngaged: [...classified].sort((a, b) => b.engagement - a.engagement).slice(0, 10),
  };

  return { ...base, insights: buildInsights(base) };
}
