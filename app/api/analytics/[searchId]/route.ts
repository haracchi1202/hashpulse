import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";
import { aggregateKPI, aggregateKPIByPlatform, dailyTimeseries, rankInfluencers, type RankBy } from "@/skills/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ searchId: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    return res as Response;
  }
  const { searchId } = await ctx.params;

  const search = await prisma.search.findFirst({
    where: { id: searchId, userId: user.id },
  });
  if (!search) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Search not found" } },
      { status: 404 }
    );
  }

  const posts = await prisma.post.findMany({
    where: { searchId },
    include: { account: true },
    orderBy: { postedAt: "asc" },
  });

  const rows = posts.map((p) => ({
    postedAt: p.postedAt,
    likeCount: p.likeCount,
    retweetCount: p.retweetCount,
    replyCount: p.replyCount,
    quoteCount: p.quoteCount,
    impressionCount: p.impressionCount,
    authorFollowers: p.account.followers,
    authorUsername: p.account.username,
    authorDisplayName: p.account.displayName ?? undefined,
    url: p.url,
    platform: p.platform,
  }));

  const kpi = aggregateKPI(rows);
  const byPlatform = aggregateKPIByPlatform(rows);
  const timeseries = dailyTimeseries(rows);
  const rankBy = (req.nextUrl.searchParams.get("rankBy") as RankBy) ?? "er";
  const influencers = rankInfluencers(rows, rankBy, 10);

  return NextResponse.json({
    ok: true,
    data: {
      search,
      kpi,
      byPlatform,
      timeseries,
      influencers,
    },
  });
}
