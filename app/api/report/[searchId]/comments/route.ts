import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";
import { collectComments, type CommentTarget } from "@/skills/comments";
import { Platform } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// コスト管理: 1検索あたり、エンゲージメント上位 N 投稿のコメントだけ取得する。
const TOP_POSTS = Number(process.env.COMMENTS_TOP_POSTS ?? 8);
const PER_POST = Number(process.env.COMMENTS_PER_POST ?? 30);

export async function POST(req: NextRequest, ctx: { params: Promise<{ searchId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    return res as Response;
  }
  const { searchId } = await ctx.params;

  const search = await prisma.search.findFirst({ where: { id: searchId, userId: user.id } });
  if (!search) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Search not found" } },
      { status: 404 }
    );
  }

  // エンゲージメント上位の投稿を対象にする（コメントが付いていそうな順）
  const posts = await prisma.post.findMany({
    where: { searchId },
    orderBy: [{ replyCount: "desc" }, { likeCount: "desc" }],
    take: TOP_POSTS,
  });

  const targets: CommentTarget[] = posts
    .filter((p) => p.externalId)
    .map((p) => ({ postId: p.id, platform: p.platform, externalId: p.externalId }));

  const { byPostId, errors } = await collectComments(targets, { perPost: PER_POST });

  // 保存（upsert: platform + externalId 一意）
  let saved = 0;
  for (const [postId, comments] of byPostId) {
    for (const c of comments) {
      if (!c.externalId || !c.text) continue;
      await prisma.comment.upsert({
        where: { platform_externalId: { platform: c.platform as Platform, externalId: c.externalId } },
        create: {
          postId,
          platform: c.platform as Platform,
          externalId: c.externalId,
          text: c.text,
          authorUsername: c.authorUsername,
          likeCount: c.likeCount,
          postedAt: c.postedAt ? new Date(c.postedAt) : null,
        },
        update: { likeCount: c.likeCount, text: c.text },
      });
      saved++;
    }
  }

  return NextResponse.json({
    ok: true,
    data: { targetPosts: targets.length, savedComments: saved, errors },
  });
}
