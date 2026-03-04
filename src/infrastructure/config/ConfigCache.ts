/**
 * ConfigCache provides time-based caching for configuration data.
 *
 * Features:
 * - TTL (time-to-live) for cache entries
 * - Simple get/set/invalidate operations
 * - Thread-safe (single-threaded Node.js)
 */
export class ConfigCache<V> {
  private cache: Map<string, { value: V; expiresAt: number }> = new Map();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 1000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Get a cached value if present and not expired.
   */
  get(key: string): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Set a cached value with optional TTL (ms).
   */
  set(key: string, value: V, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Invalidate a specific cache entry.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of cached entries.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Prune expired entries (optional maintenance).
   */
  prune(): void {
    const now = Date.now;
    for (const [key, entry] of this.cache) {
      if (now() > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}
