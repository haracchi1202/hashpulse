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
    select: {
      id: true,
      status: true,
      postCount: true,
      lastErrors: true,
      lastRunAt: true,
      createdAt: true,
    },
  });

  if (!search) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "検索が見つかりません" } },
      { status: 404 }
    );
  }

  let status = search.status;
  let errors: string[] = Array.isArray(search.lastErrors)
    ? (search.lastErrors as unknown[]).map(String)
    : [];

  // 自己修復: バックグラウンド収集が finalize 前に関数寿命(最大300s)で死ぬと
  // status が RUNNING のまま残る。作成から閾値を超えた RUNNING は確実に死んでいるので
  // ERROR に倒し、フロントの無限ポーリングを止める（二度と固まらせない安全弁）。
  const STALE_MS = Number(process.env.COLLECT_STALE_MS ?? 360000);
  if (status === "RUNNING" && Date.now() - new Date(search.createdAt).getTime() > STALE_MS) {
    status = "ERROR";
    errors = ["collect: バックグラウンド処理が時間内に完了しませんでした（中断）"];
    await prisma.search
      .update({ where: { id: search.id }, data: { status: "ERROR", lastErrors: errors } })
      .catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    data: {
      searchId: search.id,
      status,
      postCount: search.postCount,
      errors,
      lastRunAt: search.lastRunAt,
    },
  });
}
