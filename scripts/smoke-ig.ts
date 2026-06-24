// Instagram Graph API v22.0 への疎通確認スクリプト
// 使用法: npx tsx --env-file=.env.local scripts/smoke-ig.ts ddtpro 三井アウトレットパーク
// 必要 env: IG_ACCESS_TOKEN, IG_USER_ID, IG_USE_MOCK=false

import { igSearch } from "../skills/instagram-api";

async function main() {
  const hashtags = process.argv.slice(2);
  if (hashtags.length === 0) {
    console.error("Usage: smoke-ig.ts <tag1> [tag2] ...");
    process.exit(2);
  }
  // 先頭の # は捨てる
  const cleaned = hashtags.map((t) => t.replace(/^#/, ""));

  if (process.env.IG_USE_MOCK !== "false") {
    console.warn("[warn] IG_USE_MOCK が \"false\" でないため mock 動作します。実 API を叩くには IG_USE_MOCK=false を設定してください。");
  }
  if (!process.env.IG_ACCESS_TOKEN || !process.env.IG_USER_ID) {
    console.warn("[warn] IG_ACCESS_TOKEN / IG_USER_ID が未設定です。Meta Developers > Graph API Explorer で長期トークンを取得してください。");
  }

  console.log(`Hashtags:  ${cleaned.map((t) => "#" + t).join(", ")}`);
  console.log(`Mode:      ${process.env.IG_USE_MOCK === "false" ? "real" : "mock"}`);
  console.log("---");

  const start = Date.now();
  let posts: Awaited<ReturnType<typeof igSearch>>;
  try {
    posts = await igSearch({
      hashtags: cleaned,
      limit: 15,
    });
  } catch (e) {
    console.error("[ERR]", (e as Error).message);
    process.exit(1);
  }
  const ms = Date.now() - start;

  console.log(`Fetched ${posts.length} posts in ${ms}ms`);
  for (const p of posts.slice(0, 5)) {
    console.log(
      `[${p.postedAt.slice(0, 16)}] likes=${p.likeCount} replies=${p.replyCount}  ${p.url}`
    );
    console.log(`  tags: ${p.hashtags.join(", ")}`);
    console.log(`  ${p.text.slice(0, 120).replace(/\n/g, " ")}`);
  }

  // 合計
  const totals = posts.reduce(
    (acc, p) => ({
      likes: acc.likes + p.likeCount,
      replies: acc.replies + p.replyCount,
    }),
    { likes: 0, replies: 0 }
  );
  console.log("---");
  console.log(`Total: ${posts.length} posts / ${totals.likes} likes / ${totals.replies} comments`);
}

main().catch((e) => {
  console.error("Smoke test failed:", e);
  process.exit(1);
});
