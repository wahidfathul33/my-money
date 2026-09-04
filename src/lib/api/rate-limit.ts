/**
 * General-purpose per-key rate limiter for route handlers — same fixed-window
 * counter design as src/lib/auth/rate-limit.ts (login-only), generalized
 * with a configurable window/max so other endpoints don't each reinvent it.
 * First consumer: `GET /api/transactions`'s search parameter, 30/minute per
 * user (tasks/09-transaction-history/todo.md "Rate limit pencarian: 30 /
 * menit").
 *
 * Same caveat as the login limiter: in-memory, per-process — correct for a
 * single Node.js instance, NOT shared across concurrent Vercel serverless
 * instances. Task 23's general rate-limiting work is expected to replace
 * this with a shared store; documented here rather than silently pretending
 * otherwise.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/** Fixed-window limiter keyed by an arbitrary string (typically `"<scope>:<userId>"`). */
export function checkRateLimit(key: string, options: RateLimitOptions, now = Date.now()): RateLimitResult {
  pruneIfLarge(now, options.windowMs);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= options.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: options.max - 1 };
  }

  if (bucket.count >= options.max) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: options.max - bucket.count };
}

/** Test-only: clears all tracked buckets so tests don't leak state between runs. */
export function resetRateLimit(): void {
  buckets.clear();
}

function pruneIfLarge(now: number, windowMs: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) {
      buckets.delete(key);
    }
  }
}
