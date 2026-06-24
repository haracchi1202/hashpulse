// 軽量テスト: npx tsx tests/reaction.test.ts
import { classify, analyzeReactions, type ReactionInput } from "../skills/reaction";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    pass++;
    console.log(`  OK: ${name}`);
  } else {
    fail++;
    console.log(`  FAIL: ${name}${got !== undefined ? ` (got ${JSON.stringify(got)})` : ""}`);
  }
}

// classify 単体
const c1 = classify("このアクスタかわいすぎてお迎えできて幸せ！");
check("positive + かわいい/欲しい", c1.polarity === "positive" && c1.emotions.includes("かわいい"), c1);

const c2 = classify("高すぎる…品質も雑でがっかり");
check("negative + 高い/品質が悪い", c2.polarity === "negative" && c2.emotions.includes("高い"), c2);

const c3 = classify("売り切れてた。再販してほしい");
check("再販希望は positive 寄り", c3.polarity === "positive" && c3.emotions.includes("再販希望"), c3);

const c4 = classify("本日17時より発売します");
check("告知は neutral", c4.polarity === "neutral", c4);

// analyzeReactions 集計
const posts: ReactionInput[] = [
  mk("1", "X", "かわいい！最高に好き", 100, 5000),
  mk("2", "TIKTOK", "高すぎて萎えた", 3, 200),
  mk("3", "INSTAGRAM", "再販希望 売り切れ", 50, 0),
  mk("4", "X", "本日発売", 1, 100),
];
const r = analyzeReactions(posts);
check("total=4", r.total === 4, r.total);
check("positive=2 (1,3)", r.polarity.positive === 2, r.polarity);
check("negative=1 (2)", r.polarity.negative === 1, r.polarity);
check("engagement合計が出る", r.engagement.total > 0, r.engagement.total);
check("hasImpressions=true", r.hasImpressions === true);
check("byPlatform に X/TIKTOK/INSTAGRAM", r.byPlatform.length === 3, r.byPlatform.map((b) => b.platform));
check("topPositive はエンゲージ降順", r.topPositive[0]?.id === "1", r.topPositive[0]?.id);
check("insights が生成される", r.insights.length > 0);

function mk(id: string, platform: string, text: string, like: number, impr: number): ReactionInput {
  return {
    id, platform, text, url: `https://x/${id}`, authorUsername: `u${id}`,
    likeCount: like, retweetCount: 0, replyCount: 0, quoteCount: 0, impressionCount: impr,
  };
}

console.log(`\n${pass} passed / ${fail} failed`);
if (fail > 0) process.exit(1);
