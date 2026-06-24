import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";
import { toCSV, toXLSX, type PostExportRow } from "@/skills/export";

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
  const format = (req.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();

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
    include: { account: true, hashtags: true },
    orderBy: { postedAt: "desc" },
  });

  const rows: PostExportRow[] = posts.map((p) => ({
    platform: p.platform,
    postedAt: p.postedAt.toISOString(),
    authorUsername: p.account.username,
    authorDisplayName: p.account.displayName ?? "",
    followers: p.account.followers,
    text: p.text.replace(/\n/g, " "),
    url: p.url,
    likeCount: p.likeCount,
    retweetCount: p.retweetCount,
    replyCount: p.replyCount,
    quoteCount: p.quoteCount,
    impressionCount: p.impressionCount,
    hashtags: p.hashtags.map((h) => `#${h.displayName}`).join(" "),
  }));

  const safeName = (search.name ?? search.query)
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
  const fileBase = `hashpulse_${safeName}_${stamp}`;

  if (format === "xlsx") {
    const buf = await toXLSX(rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
      },
    });
  }

  // default: csv
  const csv = toCSV(rows);
  // BOM for Excel
  const body = "﻿" + csv;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
    },
  });
}
