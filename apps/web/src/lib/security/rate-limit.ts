import 'server-only';

/**
 * Fixed-window rate limiter.
 *
 * In-process by default, which is correct for a single node and honest about
 * its limits: behind several instances each one keeps its own counter, so the
 * effective limit multiplies by the instance count. That is acceptable for
 * abuse-dampening on public reads and not acceptable for anything security
 * critical, which is why sign-in throttling is done in the database against the
 * user row instead.
 *
 * Set REDIS_URL to get a shared counter; without it the limiter degrades to
 * per-process rather than failing.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  // Amortised cleanup: without it the map grows unbounded on a busy public
  // endpoint where every visitor is a new key.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, bucket);
    return {
      ok: true,
      limit,
      remaining: limit - 1,
      resetAt: bucket.resetAt,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  const ok = existing.count <= limit;
  return {
    ok,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: ok ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
  };
  if (!result.ok) headers['Retry-After'] = String(result.retryAfterSeconds);
  return headers;
}

/**
 * Client identity for rate limiting. Trusts `x-forwarded-for` only because the
 * app is expected to sit behind a proxy that sets it; if it is ever exposed
 * directly this becomes spoofable and the limiter becomes decorative.
 */
export function clientKey(request: Request, prefix: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `${prefix}:${ip}`;
}
