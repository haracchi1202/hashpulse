// X API v2 への疎通確認スクリプト
// 使用法: node --env-file=.env.local --experimental-strip-types scripts/smoke-x.ts "#筋トレ"
// もしくは:  npx tsx --env-file=.env.local scripts/smoke-x.ts "#筋トレ"
// 必要: X_BEARER_TOKEN が .env.local に設定済み

import { searchRecent } from "../skills/x-api";
import { parse, compileToXQuery } from "../skills/hashtag-parser";

async function main() {
  const queryArg = process.argv.slice(2).join(" ") || "#test";

  let xQuery: string;
  try {
    const ast = parse(queryArg);
    xQuery = compileToXQuery(ast);
  } catch (e) {
    console.error("Parse error:", (e as Error).message);
    process.exit(1);
  }

  console.log(`Input:     ${queryArg}`);
  console.log(`X Query:   ${xQuery}`);
  console.log("---");

  if (!process.env.X_BEARER_TOKEN) {
    console.error("X_BEARER_TOKEN is not set. Aborting (parser dry-run only).");
    process.exit(2);
  }

  const start = Date.now();
  const posts = await searchRecent({
    query: xQuery,
    lang: "ja",
    maxResults: 10,
    maxPages: 1,
  });
  const ms = Date.now() - start;

  console.log(`Fetched ${posts.length} posts in ${ms}ms`);
  for (const p of posts.slice(0, 5)) {
    console.log(
      `[${p.postedAt.slice(0, 16)}] @${p.authorUsername} ` +
        `likes=${p.likeCount} rt=${p.retweetCount} impr=${p.impressionCount}`
    );
    console.log(`  ${p.text.slice(0, 100).replace(/\n/g, " ")}`);
  }
}

main().catch((e) => {
  console.error("Smoke test failed:", e);
  process.exit(1);
});
