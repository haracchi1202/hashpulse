"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { CompareItem } from "@/lib/types";

export type CompareMetric =
  | "postCount"
  | "totalLikes"
  | "totalImpressions"
  | "avgER";

// 検索の選択順とチャートの色を揃えるため共有
export const COMPARE_COLORS = [
  "hsl(188 95% 56%)", // cyan
  "hsl(43 96% 56%)", // amber
  "hsl(330 81% 60%)", // pink
  "hsl(142 71% 45%)", // green
  "hsl(258 90% 66%)", // violet
  "hsl(0 84% 60%)", // red
];

export function HashtagCompareChart({
  items,
  metric,
}: {
  items: CompareItem[];
  metric: CompareMetric;
}) {
  const isPercent = metric === "avgER";

  // 全検索の日付を和集合してソート → 各日付に検索ごとの値を載せる
  const dates = Array.from(
    new Set(items.flatMap((it) => it.timeseries.map((p) => p.date)))
  ).sort();

  const data = dates.map((date) => {
    const row: Record<string, number | string | null> = { date };
    for (const it of items) {
      const pt = it.timeseries.find((p) => p.date === date);
      row[it.searchId] = pt ? pt[metric] : null;
    }
    return row;
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: -4, bottom: 0 }}>
          <CartesianGrid stroke="hsl(217 33% 17%)" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="hsl(215 20% 65%)" fontSize={11} />
          <YAxis
            stroke="hsl(215 20% 65%)"
            fontSize={11}
            tickFormatter={
              isPercent ? (v: number) => `${(v * 100).toFixed(0)}%` : undefined
            }
          />
          <Tooltip
            contentStyle={{
              background: "hsl(222 47% 9%)",
              border: "1px solid hsl(217 33% 17%)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={
              isPercent
                ? (v: number | string) =>
                    typeof v === "number" ? `${(v * 100).toFixed(2)}%` : v
                : undefined
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {items.map((it, i) => (
            <Line
              key={it.searchId}
              type="monotone"
              dataKey={it.searchId}
              name={it.name ?? it.query}
              stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
