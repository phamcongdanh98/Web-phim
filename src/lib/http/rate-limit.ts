import { HttpError } from "@/lib/http/errors";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Fixed-window in-memory limiter. Adequate for a single instance (the intended deployment).
 * Throws 429 + Retry-After when exceeded.
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) prune(now);
    return;
  }
  b.count++;
  if (b.count > limit) {
    throw new HttpError(429, "Bạn thao tác quá nhanh. Vui lòng thử lại sau.", {
      code: "RATE_LIMITED",
      retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    });
  }
}

function prune(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export function resetRateLimits() {
  buckets.clear();
}
