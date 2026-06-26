import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { Platform } from "@prisma/client";
import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";
import { parse } from "@/skills/hashtag-parser";
import { runCollection } from "@/skills/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 収集はレスポンス送信後に after() でバックグラウンド実行する（クライアントは待たずに
// searchId を受け取り、status をポーリングして完了を待つ）。after コールバックも関数の
// 実行上限内で動くため、Fluid Compute の上限いっぱいまで使えるよう 300 秒に引き上げる。
export const maxDuration = 300;

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

  // Search レコードを RUNNING で作成（収集はこの後 after() でバックグラウンド実行）
  const search = await prisma.search.create({
    data: {
      userId: user.id,
      query,
      platforms: platforms as Platform[],
      filters: (filters ?? {}) as object,
      saved: save ?? false,
      name: name ?? null,
      status: "RUNNING",
      lastRunAt: new Date(),
    },
  });

  // 収集 + 永続化（cron と共有）をレスポンス送信後に実行する。
  // これによりクライアントは収集完了を待たず、/api/search/[id]/status を
  // ポーリングして進捗を取得できる（ローカルのように時間制限で切られない体験）。
  after(async () => {
    try {
      const result = await runCollection({
        searchId: search.id,
        query,
        platforms: platforms as Platform[],
        filters,
        maxResults,
      });
      await prisma.search.update({
        where: { id: search.id },
        data: { status: "DONE", postCount: result.postCount },
      });
    } catch (e) {
      console.error("[api/search] background collection failed:", e);
      await prisma.search
        .update({
          where: { id: search.id },
          data: {
            status: "ERROR",
            lastErrors: [`collect: ${(e as Error).message}`],
          },
        })
        .catch(() => {});
    }
  });

  // 収集の完了を待たずに searchId を即返す
  return NextResponse.json({
    ok: true,
    data: { searchId: search.id, status: "RUNNING" },
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
