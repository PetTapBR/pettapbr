import "server-only";

interface RateLimitOptions {
  key: string;
  maxRequests: number;
  windowMs: number;
}

interface RateLimitState {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const RATE_LIMIT_STORE = new Map<string, RateLimitState>();

function nowMs() {
  return Date.now();
}

function normalizeRetryAfter(resetAt: number) {
  return Math.max(1, Math.ceil((resetAt - nowMs()) / 1000));
}

function maybeCleanupExpiredEntries() {
  const currentTime = nowMs();

  for (const [entryKey, entry] of RATE_LIMIT_STORE.entries()) {
    if (entry.resetAt <= currentTime) {
      RATE_LIMIT_STORE.delete(entryKey);
    }
  }
}

export function consumeRateLimit(options: RateLimitOptions): RateLimitResult {
  if (options.maxRequests <= 0 || options.windowMs <= 0) {
    return {
      ok: true,
      remaining: 0,
      retryAfterSeconds: 0,
    };
  }

  maybeCleanupExpiredEntries();

  const entryKey = options.key;
  const currentTime = nowMs();
  const currentEntry = RATE_LIMIT_STORE.get(entryKey);

  if (!currentEntry || currentEntry.resetAt <= currentTime) {
    const nextEntry: RateLimitState = {
      count: 1,
      resetAt: currentTime + options.windowMs,
    };
    RATE_LIMIT_STORE.set(entryKey, nextEntry);

    return {
      ok: true,
      remaining: Math.max(0, options.maxRequests - 1),
      retryAfterSeconds: normalizeRetryAfter(nextEntry.resetAt),
    };
  }

  currentEntry.count += 1;
  RATE_LIMIT_STORE.set(entryKey, currentEntry);

  if (currentEntry.count > options.maxRequests) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: normalizeRetryAfter(currentEntry.resetAt),
    };
  }

  return {
    ok: true,
    remaining: Math.max(0, options.maxRequests - currentEntry.count),
    retryAfterSeconds: normalizeRetryAfter(currentEntry.resetAt),
  };
}
