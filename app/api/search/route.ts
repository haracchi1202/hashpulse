import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@prisma/client";
import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";
import { parse } from "@/skills/hashtag-parser";
import { runCollection } from "@/skills/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  query: z.string().min(1).max(500),
  platforms: z.array(z.enum(["X", "INSTAGRAM", "TIKTOK"])).min(1),
  filters: z
    .object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      minLikes: z.number().int().nonnegative().optional(),
      minFollowers: z.number().int().nonnegative().optional(),
      lang: z.enum(["ja", "en"]).optional(),
    })
    .optional(),
  save: z.boolean().optional(),
  name: z.string().optional(),
  maxResults: z.number().int().positive().max(5000).optional(),
});

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    return res as Response;
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: parsed.error.message } },
      { status: 400 }
    );
  }
  const { query, platforms, filters, save, name, maxResults } = parsed.data;

  // 構文パース（検証のみ。実際の収集は runCollection 内で再パース）
  try {
    parse(query);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "PARSE_ERROR", message: (e as Error).message } },
      { status: 400 }
    );
  }

  // Search レコード作成
  const search = await prisma.search.create({
    data: {
      userId: user.id,
      query,
      platforms: platforms as Platform[],
      filters: (filters ?? {}) as object,
      saved: save ?? false,
      name: name ?? null,
      lastRunAt: new Date(),
    },
  });

  // 収集 + 永続化（cron と共有）
  const result = await runCollection({
    searchId: search.id,
    query,
    platforms: platforms as Platform[],
    filters,
    maxResults,
  });

  return NextResponse.json({
    ok: true,
    data: { searchId: search.id, postCount: result.postCount, errors: result.errors },
  });
}

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    return res as Response;
  }
  const saved = req.nextUrl.searchParams.get("saved") === "true";
  const searches = await prisma.search.findMany({
    where: { userId: user.id, ...(saved ? { saved: true } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ ok: true, data: searches });
}
