import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigCache } from '../../../src/infrastructure/config/ConfigCache';

describe('ConfigCache', () => {
  let cache: ConfigCache;

  beforeEach(() => {
    cache = new ConfigCache(1000); // 1s TTL
  });

  it('should set and get a value', () => {
    cache.set('key1', { a: 1 });
    expect(cache.get('key1')).toEqual({ a: 1 });
  });

  it('should return undefined for missing key', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should invalidate a specific key', () => {
    cache.set('k2', 42);
    cache.invalidate('k2');
    expect(cache.get('k2')).toBeUndefined();
  });

  it('should clear all entries', () => {
    cache.set('x', 1);
    cache.set('y', 2);
    cache.clear();
    expect(cache.get('x')).toBeUndefined();
    expect(cache.get('y')).toBeUndefined();
  });

  it('should prune expired entries', async () => {
    const fastCache = new ConfigCache(10); // 10ms
    fastCache.set('temp', 'value');

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 20));
    fastCache.prune();

    expect(fastCache.get('temp')).toBeUndefined();
  });

  it('should report size', () => {
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('should auto-prune on get if expired', async () => {
    const shortCache = new ConfigCache(50);
    shortCache.set('expiring', 'data');

    await new Promise((r) => setTimeout(r, 100));
    // next get should prune
    expect(shortCache.get('expiring')).toBeUndefined();
  });
});
