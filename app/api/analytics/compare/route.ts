import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";
import { aggregateKPI, dailyTimeseries } from "@/skills/analytics";
import type { CompareItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COMPARE = 6;

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    return res as Response;
  }

  const raw = req.nextUrl.searchParams.get("searchIds") ?? "";
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ].slice(0, MAX_COMPARE);

  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "searchIds is required" } },
      { status: 400 }
    );
  }

  const searches = await prisma.search.findMany({
    where: { id: { in: ids }, userId: user.id },
  });
  if (searches.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "No matching searches" } },
      { status: 404 }
    );
  }

  const posts = await prisma.post.findMany({
    where: { searchId: { in: searches.map((s) => s.id) } },
    include: { account: true },
    orderBy: { postedAt: "asc" },
  });

  const bySearch = new Map<string, typeof posts>();
  for (const p of posts) {
    const arr = bySearch.get(p.searchId) ?? [];
    arr.push(p);
    bySearch.set(p.searchId, arr);
  }

  // リクエストで指定された順序を保ちつつ、所有確認済みの検索のみ採用
  const items: CompareItem[] = ids
    .map((id) => searches.find((s) => s.id === id))
    .filter((s): s is (typeof searches)[number] => Boolean(s))
    .map((s) => {
      const rows = (bySearch.get(s.id) ?? []).map((p) => ({
        postedAt: p.postedAt,
        likeCount: p.likeCount,
        retweetCount: p.retweetCount,
        replyCount: p.replyCount,
        quoteCount: p.quoteCount,
        impressionCount: p.impressionCount,
        authorFollowers: p.account.followers,
      }));
      return {
        searchId: s.id,
        query: s.query,
        name: s.name ?? undefined,
        platforms: s.platforms,
        kpi: aggregateKPI(rows),
        timeseries: dailyTimeseries(rows),
      };
    });

  return NextResponse.json({ ok: true, data: { items } });
}
