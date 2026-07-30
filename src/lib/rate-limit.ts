/**
 * In-memory rate limiter for Next.js middleware.
 *
 * Uses a sliding-window-per-IP strategy. Each IP gets a bucket of N requests
 * per minute. When the bucket is empty, subsequent requests get 429.
 *
 * Memory is bounded by MAX_BUCKETS — when the bucket count exceeds this,
 * the oldest entries are evicted (FIFO). This prevents unbounded growth
 * in case of a DDoS with many spoofed IPs.
 *
 * This works for a single Next.js instance. For multi-instance deployments,
 * replace this with a Redis-backed limiter.
 */

/** A rate-limit bucket — tracks request timestamps within the window. */
type Bucket = {
  /** Sliding window of request timestamps (epoch ms). */
  hits: number[];
  /** Last access time — for FIFO eviction. */
  lastAccess: number;
};

const MAX_BUCKETS = 10_000;
const buckets = new Map<string, Bucket>();

/** Periodically prune stale buckets (older than 2× window). */
function pruneStale(windowMs: number) {
  const cutoff = Date.now() - 2 * windowMs;
  for (const [key, bucket] of buckets) {
    if (bucket.lastAccess < cutoff) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Epoch ms when the bucket resets. */
  resetAt: number;
  /** Total limit (for X-RateLimit-Limit header). */
  limit: number;
}

/**
 * Check whether a request from the given identifier (typically IP) is allowed
 * under the rate limit, and record the hit if so.
 *
 * @param id        The identifier to bucket on (IP address, user ID, etc.)
 * @param limit     Max requests per window.
 * @param windowMs  Window size in milliseconds.
 * @returns         { allowed, remaining, resetAt, limit }
 */
export function rateLimit(id: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Prune stale entries occasionally (every ~1000 calls)
  if (buckets.size > MAX_BUCKETS * 0.9) {
    pruneStale(windowMs);
  }

  let bucket = buckets.get(id);
  if (!bucket) {
    bucket = { hits: [], lastAccess: now };
    buckets.set(id, bucket);

    // Enforce MAX_BUCKETS — evict the oldest entry
    if (buckets.size > MAX_BUCKETS) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, b] of buckets) {
        if (b.lastAccess < oldestTime) {
          oldestTime = b.lastAccess;
          oldestKey = k;
        }
      }
      if (oldestKey) buckets.delete(oldestKey);
    }
  }

  bucket.lastAccess = now;

  // Filter out hits outside the current window
  bucket.hits = bucket.hits.filter((t) => t > windowStart);

  if (bucket.hits.length >= limit) {
    // Bucket is exhausted — return 429 info but DON'T record the hit
    const oldestHit = bucket.hits[0] || now;
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestHit + windowMs,
      limit,
    };
  }

  // Record the hit
  bucket.hits.push(now);

  return {
    allowed: true,
    remaining: limit - bucket.hits.length,
    resetAt: now + windowMs,
    limit,
  };
}

/** Extract a stable client identifier from request headers. */
export function getClientId(request: Request): string {
  // Prefer the forwarded-for header (when behind a proxy/load balancer)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP (closest to the client)
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  // Fallback — fall back to a fixed string (rare in production)
  return "anonymous";
}
