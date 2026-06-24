import { Platform } from "@prisma/client";
import { prisma } from "@/skills/prisma";
import { parse, compileToXQuery, evaluate, evaluateContent, hashtagsIn, termsToTags } from "@/skills/hashtag-parser";
import { searchX } from "@/skills/x-api";
import { igSearch } from "@/skills/instagram-api";
import { searchTikTok, getTikTokSearchMode } from "@/skills/tiktok-api";
import { generateSnapshots } from "@/skills/snapshot";
import type { NormalizedPost, SearchFilters } from "@/lib/types";

export interface CollectInput {
  /** 既存の Search レコード id。収集した Post はこの searchId に紐づく */
  searchId: string;
  query: string;
  platforms: Platform[];
  filters?: SearchFilters;
  maxResults?: number;
}

export interface CollectResult {
  postCount: number;
  /** プラットフォーム単位の非致命エラー（片方失敗しても処理は続行） */
  errors: string[];
}

/**
 * 検索クエリを各プラットフォームで実行し、結果を正規化・重複排除して DB に永続化する。
 * `/api/search`（新規検索）と `/api/cron/collect`（saved 検索の自動再収集）で共有。
 *
 * - query のパースに失敗した場合は例外を投げる（呼び出し側で 400 等にマップ）。
 * - API 呼び出し失敗はプラットフォーム単位で握りつぶし、`errors` に積んで続行する。
 * - 完了時に Search.lastRunAt を更新する。
 */
export async function runCollection(input: CollectInput): Promise<CollectResult> {
  const { searchId, query, platforms, filters, maxResults } = input;
  const errors: string[] = [];

  // 構文パース（失敗時は例外 → 呼び出し側が処理）
  const ast = parse(query);

  const collected: NormalizedPost[] = [];

  if (platforms.includes("X")) {
    const xQuery = compileToXQuery(ast);
    try {
      const xPosts = await searchX({
        query: xQuery,
        startTime: filters?.startDate ? `${filters.startDate}T00:00:00Z` : undefined,
        endTime: filters?.endDate ? `${filters.endDate}T23:59:59Z` : undefined,
        lang: filters?.lang,
        minLikes: filters?.minLikes,
        minFollowers: filters?.minFollowers,
        maxResults: maxResults ?? 50,
        maxPages: 2,
      });
      collected.push(...xPosts);
    } catch (e) {
      console.error("[collect] X API error:", e);
      errors.push(`X: ${(e as Error).message}`);
    }
  }

  if (platforms.includes("INSTAGRAM")) {
    // IG はタグ検索のみ。#なしキーワードは自動でハッシュタグ化して検索する。
    const igAst = termsToTags(ast);
    const leaves = hashtagsIn(igAst);
    if (leaves.length === 0) {
      errors.push("IG: 検索語がありません（キーワードまたは #タグを入力してください）");
    } else {
      try {
        const igPosts = await igSearch({
          hashtags: leaves,
          startTime: filters?.startDate,
          endTime: filters?.endDate,
          minLikes: filters?.minLikes,
          limit: maxResults ?? 50,
        });
        // IG は単一タグ取得 → AND/NOT を後処理で評価（キーワードもタグ化済みで評価）
        for (const p of igPosts) {
          if (evaluate(igAst, new Set(p.hashtags))) {
            collected.push(p);
          }
        }
      } catch (e) {
        console.error("[collect] IG error:", e);
        errors.push(`IG: ${(e as Error).message}`);
      }
    }
  }

  if (platforms.includes("TIKTOK")) {
    // TikTok もタグ検索。IG 同様 #なしキーワードは自動でハッシュタグ化して検索する。
    const ttAst = termsToTags(ast);
    const leaves = hashtagsIn(ttAst);
    if (leaves.length === 0) {
      errors.push("TikTok: 検索語がありません（キーワードまたは #タグを入力してください）");
    } else {
      try {
        const ttMode = getTikTokSearchMode();
        const ttPosts = await searchTikTok({
          hashtags: leaves,
          mode: ttMode,
          startTime: filters?.startDate,
          endTime: filters?.endDate,
          minLikes: filters?.minLikes,
          limit: maxResults ?? 50,
        });
        // hashtag モードは #一致を後処理で評価（IG と同じ方針）。
        // keyword モードは EnsembleData がクォート未対応で日本語をトークン分割し
        // 「うるぷくシール」→「うる/ぷく/シール」を含むだけの投稿まで返すため、
        // 元 AST を本文に対してフレーズ完全一致評価し、過剰収集を除外する（他のワードでも同様）。
        for (const p of ttPosts) {
          const ok =
            ttMode === "keyword"
              ? evaluateContent(ast, p)
              : evaluate(ttAst, new Set(p.hashtags));
          if (ok) collected.push(p);
        }
      } catch (e) {
        console.error("[collect] TikTok error:", e);
        errors.push(`TikTok: ${(e as Error).message}`);
      }
    }
  }

  // 重複排除 (platform + externalId)
  const seen = new Set<string>();
  const dedup = collected.filter((p) => {
    const key = `${p.platform}:${p.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // DB 保存 (account upsert → hashtag upsert → post upsert)
  for (const p of dedup) {
    const account = await prisma.account.upsert({
      where: {
        platform_externalId: {
          platform: p.platform as Platform,
          externalId: p.authorExternalId,
        },
      },
      create: {
        platform: p.platform as Platform,
        externalId: p.authorExternalId,
        username: p.authorUsername,
        displayName: p.authorDisplayName,
        followers: p.authorFollowers ?? 0,
      },
      update: {
        username: p.authorUsername,
        displayName: p.authorDisplayName,
        followers: p.authorFollowers ?? 0,
      },
    });

    const hashtagRecords = await Promise.all(
      p.hashtags.map((h) =>
        prisma.hashtag.upsert({
          where: { normalized: h.toLowerCase() },
          create: { normalized: h.toLowerCase(), displayName: h },
          update: {},
        })
      )
    );

    await prisma.post.upsert({
      where: {
        platform_externalId: {
          platform: p.platform as Platform,
          externalId: p.externalId,
        },
      },
      create: {
        searchId,
        accountId: account.id,
        platform: p.platform as Platform,
        externalId: p.externalId,
        text: p.text,
        url: p.url,
        postedAt: new Date(p.postedAt),
        likeCount: p.likeCount,
        retweetCount: p.retweetCount,
        replyCount: p.replyCount,
        quoteCount: p.quoteCount,
        impressionCount: p.impressionCount,
        hashtags: { connect: hashtagRecords.map((h) => ({ id: h.id })) },
      },
      update: {
        likeCount: p.likeCount,
        retweetCount: p.retweetCount,
        replyCount: p.replyCount,
        quoteCount: p.quoteCount,
        impressionCount: p.impressionCount,
        searchId,
      },
    });
  }

  await prisma.search.update({
    where: { id: searchId },
    // lastErrors にプラットフォーム別エラーを保存（レート上限 495 等をダッシュボードで表示するため）
    data: { lastRunAt: new Date(), lastErrors: errors },
  });

  // 日別事前集計（Snapshot）を再生成。失敗しても収集自体は成功扱いにする。
  try {
    await generateSnapshots(searchId);
  } catch (e) {
    console.error("[collect] snapshot generation failed:", e);
    errors.push(`snapshot: ${(e as Error).message}`);
  }

  return { postCount: dedup.length, errors };
}
