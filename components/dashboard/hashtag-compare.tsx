"use client";

import { useState, useEffect, useCallback } from "react";
import type { CompareItem, Platform } from "@/lib/types";
import {
  HashtagCompareChart,
  COMPARE_COLORS,
  type CompareMetric,
} from "@/components/charts/hashtag-compare-chart";
import { formatNumber, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type SearchOption = {
  id: string;
  query: string;
  name: string | null;
  platforms: Platform[];
  saved: boolean;
  createdAt: string;
};

const METRICS: { key: CompareMetric; label: string }[] = [
  { key: "postCount", label: "投稿数" },
  { key: "totalLikes", label: "合計いいね" },
  { key: "totalImpressions", label: "合計表示数" },
  { key: "avgER", label: "平均 ER" },
];

const MAX_COMPARE = 6;

export function HashtagCompare({ searches }: { searches: SearchOption[] }) {
  const [selected, setSelected] = useState<string[]>(() =>
    searches.slice(0, 2).map((s) => s.id)
  );
  const [metric, setMetric] = useState<CompareMetric>("postCount");
  const [items, setItems] = useState<CompareItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analytics/compare?searchIds=${encodeURIComponent(ids.join(","))}`
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "取得に失敗しました");
      setItems(json.data.items as CompareItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selected);
  }, [selected, fetchData]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_COMPARE
          ? prev
          : [...prev, id]
    );
  };

  const colorOf = (id: string) => {
    const idx = selected.indexOf(id);
    return idx >= 0 ? COMPARE_COLORS[idx % COMPARE_COLORS.length] : undefined;
  };

  const atLimit = selected.length >= MAX_COMPARE;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {/* 選択リスト */}
      <aside className="lg:col-span-1 rounded-lg border border-border bg-card/40 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">検索を選択</h2>
          <span className="text-xs text-muted-foreground">
            {selected.length}/{MAX_COMPARE}
          </span>
        </div>
        <ul className="space-y-1 max-h-[28rem] overflow-y-auto">
          {searches.map((s) => {
            const checked = selected.includes(s.id);
            const disabled = !checked && atLimit;
            return (
              <li key={s.id}>
                <label
                  className={cn(
                    "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-secondary",
                    disabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {checked && (
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: colorOf(s.id) }}
                        />
                      )}
                      <span className="truncate font-mono text-xs">
                        {s.name ?? s.query}
                      </span>
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {s.platforms.join(", ")} ·{" "}
                      {new Date(s.createdAt).toLocaleDateString("ja-JP")}
                      {s.saved ? " · ★" : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* チャート + KPI 比較 */}
      <section className="lg:col-span-3 space-y-4">
        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs transition-colors",
                    metric === m.key
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:bg-secondary"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {loading && (
              <span className="text-xs text-muted-foreground">読み込み中…</span>
            )}
          </div>

          {error ? (
            <p className="py-12 text-center text-sm text-destructive">{error}</p>
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              左から比較する検索を選択してください。
            </p>
          ) : (
            <HashtagCompareChart items={items} metric={metric} />
          )}
        </div>

        {items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">検索</th>
                  <th className="px-3 py-2 font-medium text-right">投稿数</th>
                  <th className="px-3 py-2 font-medium text-right">合計いいね</th>
                  <th className="px-3 py-2 font-medium text-right">合計表示数</th>
                  <th className="px-3 py-2 font-medium text-right">平均 ER</th>
                  <th className="px-3 py-2 font-medium text-right">平均いいね</th>
                </tr>
              </thead>
              <tbody className="font-tabular">
                {items.map((it, i) => (
                  <tr key={it.searchId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background:
                              COMPARE_COLORS[i % COMPARE_COLORS.length],
                          }}
                        />
                        <span className="truncate font-mono text-xs">
                          {it.name ?? it.query}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(it.kpi.postCount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(it.kpi.totalLikes)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(it.kpi.totalImpressions)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatPercent(it.kpi.avgER)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(Math.round(it.kpi.avgLikes))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
