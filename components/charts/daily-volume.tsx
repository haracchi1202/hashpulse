"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { TimeseriesPoint } from "@/lib/types";

export function DailyVolumeChart({ data }: { data: TimeseriesPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(188 95% 56%)" stopOpacity={0.6} />
              <stop offset="100%" stopColor="hsl(188 95% 56%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(217 33% 17%)" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="hsl(215 20% 65%)" fontSize={11} />
          <YAxis stroke="hsl(215 20% 65%)" fontSize={11} />
          <Tooltip
            contentStyle={{
              background: "hsl(222 47% 9%)",
              border: "1px solid hsl(217 33% 17%)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="postCount"
            stroke="hsl(188 95% 56%)"
            fill="url(#volumeFill)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
