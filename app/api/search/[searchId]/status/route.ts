import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/skills/auth";
import { prisma } from "@/skills/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 非同期収集の進捗を返す。フロントの収集中バナーがこれをポーリングし、
 * status が DONE/ERROR になったら結果を再描画する（/api/search の after() と対）。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ searchId: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    return res as Response;
  }

  const { searchId } = await params;
  const search = await prisma.search.findFirst({
    where: { id: searchId, userId: user.id },
    select: { id: true, status: true, postCount: true, lastErrors: true, lastRunAt: true },
  });

  if (!search) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "検索が見つかりません" } },
      { status: 404 }
    );
  }

  const errors: string[] = Array.isArray(search.lastErrors)
    ? (search.lastErrors as unknown[]).map(String)
    : [];

  return NextResponse.json({
    ok: true,
    data: {
      searchId: search.id,
      status: search.status,
      postCount: search.postCount,
      errors,
      lastRunAt: search.lastRunAt,
    },
  });
}
