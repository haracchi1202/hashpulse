// twitterapi.io 経由の X 全期間検索 疎通確認スクリプト
// 使用法: npx tsx --env-file=.env.local scripts/smoke-x-twitterapi.ts "うるぷくシール" 2024-01-01 2024-12-31
// 必要: TWITTERAPI_IO_KEY が .env.local に設定済み
//
// 引数: <クエリ> [startDate YYYY-MM-DD] [endDate YYYY-MM-DD]
// 公式 7日制限を超えた過去日付を指定して、全期間検索が効くことを確認できる。

import { searchTwitterApiIo } from "../skills/x-api";
import { parse, compileToXQuery } from "../skills/hashtag-parser";

async function main() {
  const [rawQuery, startDate, endDate] = [
    process.argv[2],
    process.argv[3],
    process.argv[4],
  ];
  const queryArg = rawQuery || "うるぷくシール";

  let xQuery: string;
  try {
    xQuery = compileToXQuery(parse(queryArg));
  } catch (e) {
    console.error("Parse error:", (e as Error).message);
    process.exit(1);
  }

  console.log(`Input:     ${queryArg}`);
  console.log(`X Query:   ${xQuery}`);
  console.log(`Range:     ${startDate ?? "(none)"} 〜 ${endDate ?? "(none)"}`);
  console.log("---");

  if (!process.env.TWITTERAPI_IO_KEY) {
    console.error("TWITTERAPI_IO_KEY is not set. Aborting.");
    process.exit(2);
  }

  const start = Date.now();
  const posts = await searchTwitterApiIo({
    query: xQuery,
    lang: "ja",
    startTime: startDate ? `${startDate}T00:00:00Z` : undefined,
    endTime: endDate ? `${endDate}T23:59:59Z` : undefined,
    maxResults: 30,
  });
  const ms = Date.now() - start;

  console.log(`Fetched ${posts.length} posts in ${ms}ms`);
  if (posts.length) {
    const dates = posts.map((p) => p.postedAt).sort();
    console.log(`Oldest: ${dates[0]}  /  Newest: ${dates[dates.length - 1]}`);
  }
  console.log("---");
  for (const p of posts.slice(0, 8)) {
    console.log(
      `[${p.postedAt.slice(0, 16)}] @${p.authorUsername} (f=${p.authorFollowers}) ` +
        `likes=${p.likeCount} rt=${p.retweetCount} impr=${p.impressionCount}`
    );
    console.log(`  ${p.text.slice(0, 100).replace(/\n/g, " ")}`);
  }
}

main().catch((e) => {
  console.error("Smoke test failed:", e);
  process.exit(1);
});
