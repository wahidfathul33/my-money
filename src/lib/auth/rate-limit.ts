/**
 * Login rate limiting — docs/12-security-and-auth.md §7: 5 attempts / 15
 * minutes / IP, fail CLOSED (a financial app blocking a legitimate login
 * attempt is a far smaller cost than leaving sign-in open to brute force).
 *
 * Scope note: this is login-only, as tasks/04-authentication/spec.md
 * requires ("rate limiting penuh (task 23)"). It's an in-memory fixed-window
 * counter, which is correct for a single Node.js process but does NOT share
 * state across serverless instances — on Vercel, each concurrent instance
 * gets its own window. Task 23's general rate limiting is expected to
 * replace this with a shared store (e.g. Vercel KV / Upstash). Documented
 * here rather than silently pretending this is production-grade distributed
 * rate limiting.
 */
import { headers } from 'next/headers';
import { AppError } from '@/lib/api/errors';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_TRACKED_KEYS = 10_000;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/** Fixed-window limiter: `key` is typically the caller's IP address. */
export function checkLoginRateLimit(key: string, now = Date.now()): RateLimitResult {
  pruneIfLarge(now);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: MAX_ATTEMPTS - bucket.count };
}

/** Test-only: clears all tracked buckets so tests don't leak state between runs. */
export function resetLoginRateLimit(): void {
  buckets.clear();
}

function pruneIfLarge(now: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

/** Best-effort client IP from proxy headers (Vercel sets `x-forwarded-for`). */
export function getClientIp(requestHeaders: Headers): string {
  const forwardedFor = requestHeaders.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }
  return requestHeaders.get('x-real-ip') ?? 'unknown';
}

export class RateLimitedError extends AppError {
  constructor(message = 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.') {
    super(message);
  }
}

/**
 * Server Action variant of the same limiter — used by src/app/(auth)/signin
 * actions, which call Auth.js's server-side `signIn()` directly (in-process,
 * via @auth/core) rather than going through the `/api/auth/[...nextauth]`
 * route handler's own rate-limited POST. Both entry points share the same
 * `buckets` map, so an attempt through either counts against the same
 * per-IP window.
 */
export async function assertLoginRateLimitOk(): Promise<void> {
  const requestHeaders = await headers();
  const ip = getClientIp(requestHeaders);
  const { allowed } = checkLoginRateLimit(ip);
  if (!allowed) {
    throw new RateLimitedError();
  }
}
