import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  reset: number; // epoch ms when window resets
}

/**
 * In-memory rate limiter.
 *
 * Supports custom key generation (IP, token, etc.) and per-route limits.
 */
export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private windowMs: number;
  private max: number;
  private keyGen: (req: Request) => string;

  constructor(options: {
    windowMs: number;
    max: number;
    keyGenerator: (req: Request) => string;
  }) {
    this.windowMs = options.windowMs;
    this.max = options.max;
    this.keyGen = options.keyGenerator;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.reset) {
        this.store.delete(key);
      }
    }
  }

  private getOrCreate(key: string): RateLimitEntry {
    let entry = this.store.get(key);
    const now = Date.now();
    if (!entry || now >= entry.reset) {
      entry = {
        count: 0,
        reset: now + this.windowMs,
      };
      this.store.set(key, entry);
    }
    return entry;
  }

  /**
   * Check if request is allowed.
   *
   * @returns { allowed: true; remaining: number; reset: number } | { allowed: false; remaining: 0; reset: number; retryAfter: number }
   */
  check(req: Request): { allowed: true; remaining: number; reset: number } | { allowed: false; remaining: 0; reset: number; retryAfter: number } {
    const key = this.keyGen(req);
    const entry = this.getOrCreate(key);
    const now = Date.now();

    // Prune occasionally (on every call might be heavy; we can do it lazily)
    if (this.store.size > 10000) {
      this.prune();
    }

    if (entry.count >= this.max) {
      const retryAfter = Math.ceil((entry.reset - now) / 1000);
      return { allowed: false, remaining: 0, reset: entry.reset, retryAfter };
    }

    entry.count++;
    return { allowed: true, remaining: this.max - entry.count, reset: entry.reset };
  }

  /**
   * Reset the counter for a given key (for testing or admin actions).
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Get current stats for a key.
   */
  stats(key: string): { count: number; reset: number } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    return { count: entry.count, reset: entry.reset };
  }

  /**
   * Clear all entries (e.g., on shutdown or testing).
   */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Middleware options for rate limiting.
 */
export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator: (req: Request) => string;
  skipFailed?: boolean; // if true, only count successful responses (status < 400)
  onLimitReached?: (req: Request, res: Response, info: { remaining: number; reset: number; retryAfter: number }) => void;
}

/**
 * Create rate limiting middleware.
 *
 * @param options - Rate limiter configuration
 * @returns Express middleware
 */
export function rateLimit(options: RateLimitOptions): (req: Request, res: Response, next: NextFunction) => void {
  const limiter = new RateLimiter({
    windowMs: options.windowMs,
    max: options.max,
    keyGenerator: options.keyGenerator,
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const result = limiter.check(req);

    // Add rate limit headers always (even if limited, to indicate current state)
    res.setHeader('X-RateLimit-Limit', String(options.max));
    if (result.allowed) {
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    } else {
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('Retry-After', String(result.retryAfter));
      if (options.onLimitReached) {
        options.onLimitReached(req, res, { remaining: result.remaining, reset: result.reset, retryAfter: result.retryAfter });
      }
      res.status(429).json({ error: 'Too many requests', retryAfter: result.retryAfter });
      return;
    }

    // If skipFailed, we would need to adjust count after response; not implemented in this simple version.

    next();
  };
}
