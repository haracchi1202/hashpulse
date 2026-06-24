import { NextRequest, NextResponse } from "next/server";
import { Cadence, Platform } from "@prisma/client";
import { prisma } from "@/skills/prisma";
import { runCollection } from "@/skills/collect";
import type { SearchFilters } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel の関数最大実行時間（Hobby=最大60s, Pro=最大300s）。複数検索を直列実行するため長めに。
export const maxDuration = 300;

// cadence ごとの再収集間隔（ms）
const INTERVAL_MS: Record<Exclude<Cadence, "MANUAL">, number> = {
  HOURLY: 60 * 60 * 1000,
  SIX_HOURLY: 6 * 60 * 60 * 1000,
  DAILY: 24 * 60 * 60 * 1000,
};

// cron 起動タイミングのドリフト吸収（直前実行からわずかに足りずスキップされるのを防ぐ）
const GRACE_MS = 5 * 60 * 1000;

function isDue(cadence: Cadence, lastRunAt: Date | null, now: number): boolean {
  if (cadence === "MANUAL") return false;
  if (!lastRunAt) return true;
  const interval = INTERVAL_MS[cadence];
  return now - lastRunAt.getTime() >= interval - GRACE_MS;
}

/**
 * saved=true かつ cadence != MANUAL の検索のうち、前回実行から cadence 間隔が
 * 経過したものを再収集する。Vercel Cron は GET で叩く（CRON_SECRET 設定時は
 * Authorization: Bearer <CRON_SECRET> が自動付与される）。手動トリガ用に POST も許可。
 */
async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } },
      { status: 401 }
    );
  }

  const now = Date.now();
  const searches = await prisma.search.findMany({
    where: { saved: true, cadence: { not: Cadence.MANUAL } },
    take: 100,
  });

  const due = searches.filter((s) => isDue(s.cadence, s.lastRunAt, now));

  const results: Array<{
    searchId: string;
    query: string;
    postCount?: number;
    errors?: string[];
    failed?: string;
  }> = [];

  // 直列実行（X/IG のレート制限・DB 接続数を考慮）
  for (const s of due) {
    try {
      const r = await runCollection({
        searchId: s.id,
        query: s.query,
        platforms: s.platforms as Platform[],
        filters: (s.filters as SearchFilters) ?? {},
        maxResults: 50,
      });
      results.push({ searchId: s.id, query: s.query, postCount: r.postCount, errors: r.errors });
    } catch (e) {
      console.error(`[cron] collection failed for ${s.id}:`, e);
      results.push({ searchId: s.id, query: s.query, failed: (e as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      checked: searches.length,
      ran: due.length,
      totalPosts: results.reduce((sum, r) => sum + (r.postCount ?? 0), 0),
      results,
    },
  });
}

export const GET = handle;
export const POST = handle;
