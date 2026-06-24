export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number;       // unix seconds
}

export function readRateLimit(headers: Headers): RateLimitInfo | null {
  const limit = headers.get("x-rate-limit-limit");
  const remaining = headers.get("x-rate-limit-remaining");
  const reset = headers.get("x-rate-limit-reset");
  if (!limit || !remaining || !reset) return null;
  return {
    limit: Number(limit),
    remaining: Number(remaining),
    resetAt: Number(reset),
  };
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 429 を受けたときの backoff (Retry-After ヘッダ尊重)
export function backoffMs(headers: Headers, attempt: number): number {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const sec = Number(retryAfter);
    if (!Number.isNaN(sec)) return sec * 1000;
  }
  // exponential fallback: 2^attempt * 1s, max 60s
  return Math.min(60_000, Math.pow(2, attempt) * 1000);
}
