import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const numberFormatter = new Intl.NumberFormat("ja-JP");

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return numberFormatter.format(n);
}

export function formatPercent(ratio: number | null | undefined, digits = 2): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

/**
 * platform と username からアカウントのプロフィール URL を組み立てる。
 * 不明な platform / username 欠落時は undefined。
 */
export function accountUrl(
  platform: string | null | undefined,
  username: string | null | undefined
): string | undefined {
  if (!username) return undefined;
  const handle = username.replace(/^@/, "");
  switch (platform) {
    case "X":
      return `https://x.com/${handle}`;
    case "INSTAGRAM":
      return `https://instagram.com/${handle}`;
    case "TIKTOK":
      return `https://tiktok.com/@${handle}`;
    default:
      return undefined;
  }
}
