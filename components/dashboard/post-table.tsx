"use client";

import { useMemo, useState } from "react";
import { formatNumber, formatPercent } from "@/lib/utils";
import type { Platform } from "@/lib/types";

export interface PostRow {
  id: string;
  platform: Platform;
  postedAt: string;
  authorUsername: string;
  authorDisplayName: string | null;
  followers: number;
  text: string;
  url: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
}

type SortKey = "postedAt" | "likeCount" | "impressionCount" | "er";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

export function PostTable({ rows }: { rows: PostRow[] }) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("impressionCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const engage = r.likeCount + r.retweetCount + r.replyCount + r.quoteCount;
        const denom =
          r.impressionCount && r.impressionCount > 0
            ? r.impressionCount
            : r.followers > 0
              ? r.followers
              : 0;
        const er = denom > 0 ? engage / denom : 0;
        return { ...r, er };
      }),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter(
      (r) =>
        r.text.toLowerCase().includes(q) ||
        r.authorUsername.toLowerCase().includes(q) ||
        (r.authorDisplayName ?? "").toLowerCase().includes(q)
    );
  }, [enriched, filter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortKey === "postedAt" ? new Date(a.postedAt).getTime() : a[sortKey];
      const vb = sortKey === "postedAt" ? new Date(b.postedAt).getTime() : b[sortKey];
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const slice = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
          placeholder="本文 / @username で絞り込み"
          className="flex h-9 w-72 rounded-md border border-input bg-background px-3 text-sm"
        />
        <span className="text-xs text-muted-foreground">
          {sorted.length} 件 / {totalPages} ページ
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Platform</th>
              <th className="px-3 py-2 font-medium cursor-pointer" onClick={() => toggleSort("postedAt")}>
                Posted {sortKey === "postedAt" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Text</th>
              <th className="px-3 py-2 font-medium text-right cursor-pointer" onClick={() => toggleSort("likeCount")}>
                Likes {sortKey === "likeCount" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="px-3 py-2 font-medium text-right cursor-pointer" onClick={() => toggleSort("impressionCount")}>
                Impr. {sortKey === "impressionCount" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="px-3 py-2 font-medium text-right cursor-pointer" onClick={() => toggleSort("er")}>
                ER {sortKey === "er" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="font-tabular">
            {slice.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  該当なし
                </td>
              </tr>
            ) : (
              slice.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 text-xs uppercase text-muted-foreground">{r.platform}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {new Date(r.postedAt).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-medium">{r.authorDisplayName ?? r.authorUsername}</div>
                    <div className="text-xs text-muted-foreground">@{r.authorUsername}</div>
                  </td>
                  <td className="px-3 py-2 max-w-md">
                    <div className="line-clamp-2 text-sm">{r.text}</div>
                  </td>
                  <td className="px-3 py-2 text-right">{formatNumber(r.likeCount)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(r.impressionCount)}</td>
                  <td className="px-3 py-2 text-right">{formatPercent(r.er)}</td>
                  <td className="px-3 py-2 text-right">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-primary hover:underline"
                    >
                      開く
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs">
        <button
          className="rounded-md border border-border px-3 py-1 disabled:opacity-50"
          disabled={safePage === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          前へ
        </button>
        <span className="text-muted-foreground">
          {safePage + 1} / {totalPages}
        </span>
        <button
          className="rounded-md border border-border px-3 py-1 disabled:opacity-50"
          disabled={safePage >= totalPages - 1}
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        >
          次へ
        </button>
      </div>
    </div>
  );
}
