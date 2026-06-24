// X API クエリのバリエーション比較スクリプト
// 使用: npx tsx --env-file=.env.local scripts/smoke-x-variants.ts
import { searchRecent } from "../skills/x-api";

const variants: { name: string; query: string; lang?: string; excludeRetweets?: boolean }[] = [
  { name: "from:ddtpro 三井 (no hash)", query: "from:ddtpro 三井アウトレットパーク", excludeRetweets: false },
  { name: "from:ddtpro #三井アウトレットパーク", query: "from:ddtpro #三井アウトレットパーク", excludeRetweets: false },
  { name: "from:ddtpro", query: "from:ddtpro", excludeRetweets: true },
  { name: "DDTxMOP (no hash, 直近)", query: "DDTxMOP", excludeRetweets: false },
  { name: "#DDTxMOP", query: "#DDTxMOP", excludeRetweets: false },
  { name: "DDT 三井 (キーワード AND)", query: "DDT 三井アウトレットパーク", excludeRetweets: false },
];

async function main() {
  for (const v of variants) {
    const t0 = Date.now();
    try {
      const posts = await searchRecent({
        query: v.query,
        lang: v.lang as "ja" | undefined,
        excludeRetweets: v.excludeRetweets,
        maxResults: 10,
        maxPages: 1,
      });
      const ms = Date.now() - t0;
      console.log(`[${posts.length.toString().padStart(2)} hits ${ms}ms] ${v.name}`);
      for (const p of posts.slice(0, 3)) {
        console.log(`  [${p.postedAt.slice(0, 10)}] @${p.authorUsername}: ${p.text.slice(0, 90).replace(/\n/g, " ")}`);
        console.log(`     tags: ${p.hashtags.join(", ")}`);
      }
    } catch (e) {
      console.log(`[ERR] ${v.name}: ${(e as Error).message}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }
}

main();
