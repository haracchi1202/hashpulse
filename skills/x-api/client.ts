import { backoffMs, readRateLimit, sleep } from "./rate-limit";

const BASE = "https://api.twitter.com/2";

export class XApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = "XApiError";
  }
}

function getBearer(): string {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    throw new XApiError(
      "X_BEARER_TOKEN is not set in environment",
      500,
      null
    );
  }
  return token;
}

export interface FetchOptions {
  maxRetries?: number;
}

export async function xFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  opts: FetchOptions = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  let attempt = 0;
  while (true) {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${getBearer()}`,
        "User-Agent": "HashPulse/0.1",
      },
      cache: "no-store",
    });

    if (res.status === 429 && attempt < maxRetries) {
      const wait = backoffMs(res.headers, attempt);
      console.warn(`[x-api] 429 received, backing off ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(wait);
      attempt++;
      continue;
    }

    const rate = readRateLimit(res.headers);
    if (rate && rate.remaining === 0) {
      console.warn(`[x-api] rate limit exhausted, resets at ${new Date(rate.resetAt * 1000).toISOString()}`);
    }

    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep as text
    }

    if (!res.ok) {
      throw new XApiError(
        `X API ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
        res.status,
        body
      );
    }

    return body as T;
  }
}
