// IG EnsembleData プロバイダの正規化ロジックを、保存済みの実 API レスポンスに対して検証する。
// 実 API を叩かない（日次クォータを消費しない）。global.fetch をスタブして
// /tmp/ig_probe.json（このセッションで取得した本物の /apis/instagram/hashtag/posts 応答）を返す。
//
// 使用法: npx tsx --env-file=.env.local scripts/verify-ig-ensemble.ts
import { readFileSync, existsSync } from "node:fs";
import { igSearchEnsemble } from "../skills/instagram-api/ensembledata";

// リポジトリ固定の縮小 fixture を優先。無ければ生 probe（/tmp）にフォールバック。
const REPO_FIXTURE = new URL("../tests/fixtures/ig_hashtag_posts.json", import.meta.url).pathname;
const FIXTURE = existsSync(REPO_FIXTURE) ? REPO_FIXTURE : "/tmp/ig_probe.json";
const raw = readFileSync(FIXTURE, "utf-8");

// getToken() が env を要求するのでダミーを入れておく（fetch はスタブ済みで実通信しない）
process.env.ENSEMBLEDATA_TOKEN ||= "dummy-for-offline-verify";

// global.fetch を差し替え。実際の HTTP は行わず固定レスポンスを返す。
let calls = 0;
(globalThis as unknown as { fetch: unknown }).fetch = async () => {
  calls++;
  return {
    ok: true,
    status: 200,
    async text() {
      return raw;
    },
  } as unknown as Response;
};

async function main() {
  const posts = await igSearchEnsemble({ hashtags: ["猫"], limit: 50 });

  const videos = posts.filter((p) => p.impressionCount > 0);
  const withAuthor = posts.filter((p) => p.authorUsername !== "unknown_ig");
  const withFollowers = posts.filter((p) => (p.authorFollowers ?? 0) > 0);
  const withText = posts.filter((p) => p.text.trim().length > 0);

  console.log(`fetch calls (stubbed): ${calls}`);
  console.log(`normalized posts: ${posts.length}`);
  console.log(`  with author username: ${withAuthor.length}`);
  console.log(`  with followers > 0:   ${withFollowers.length}`);
  console.log(`  with caption text:    ${withText.length}`);
  console.log(`  動画/Reels (impr>0):   ${videos.length}  ← 公式 Graph API では取れない分`);
  console.log("--- sample (first 3) ---");
  for (const p of posts.slice(0, 3)) {
    console.log(
      `  @${p.authorUsername} (fol=${p.authorFollowers}) like=${p.likeCount} cmt=${p.replyCount} impr=${p.impressionCount}`
    );
    console.log(`    url: ${p.url}`);
    console.log(`    tags: ${p.hashtags.slice(0, 6).join(", ")}`);
  }

  // アサーション
  const problems: string[] = [];
  if (posts.length === 0) problems.push("0件しか正規化できていない");
  if (videos.length === 0) problems.push("動画(Reels)が1件も取れていない");
  if (withAuthor.length === 0) problems.push("投稿者名が取れていない");
  if (posts.some((p) => !p.externalId)) problems.push("externalId 欠落の投稿がある");
  if (posts.some((p) => !p.url.startsWith("https://www.instagram.com/p/"))) {
    problems.push("URL が不正な投稿がある");
  }

  if (problems.length) {
    console.log("\nFAIL:");
    for (const x of problems) console.log("  - " + x);
    process.exit(1);
  }
  console.log("\nPASS: 実レスポンスを正しく正規化（Reels・投稿者・本文・メトリクス取得を確認）");
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
