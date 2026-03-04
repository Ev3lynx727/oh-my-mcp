import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { rateLimit, RateLimiter } from '../../src/middleware/rate-limit.js';

describe('RateLimiter class', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      windowMs: 1000,
      max: 2,
      keyGenerator: (req) => req.ip,
    });
  });

  it('allows requests within limit', () => {
    const r1 = limiter.check({ ip: '1.2.3.4' } as any);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = limiter.check({ ip: '1.2.3.4' } as any);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);
  });

  it('denies request when limit exceeded', () => {
    limiter.check({ ip: '1.2.3.4' } as any);
    limiter.check({ ip: '1.2.3.4' } as any);
    const r3 = limiter.check({ ip: '1.2.3.4' } as any);
    expect(r3.allowed).toBe(false);
    expect(r3.retryAfter).toBeGreaterThan(0);
  });

  it('resets counter after window', async () => {
    limiter.check({ ip: '1.2.3.4' } as any);
    limiter.check({ ip: '1.2.3.4' } as any);

    // Use reset method to simulate window expiry
    limiter.reset('1.2.3.4');
    const afterReset = limiter.check({ ip: '1.2.3.4' } as any);
    expect(afterReset.allowed).toBe(true);
  });

  it('separate keys have independent counters', () => {
    const r1 = limiter.check({ ip: 'a' } as any);
    const r2 = limiter.check({ ip: 'b' } as any);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it('stats returns current count', () => {
    limiter.check({ ip: '1.2.3.4' } as any);
    limiter.check({ ip: '1.2.3.4' } as any);
    const stats = limiter.stats('1.2.3.4');
    expect(stats?.count).toBe(2);
  });

  it('clear removes all entries', () => {
    limiter.check({ ip: 'a' } as any);
    limiter.check({ ip: 'b' } as any);
    limiter.clear();
    expect(limiter.stats('a')).toBeNull();
    expect(limiter.stats('b')).toBeNull();
  });
});

describe('rateLimit middleware', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(
      rateLimit({
        windowMs: 1000,
        max: 1,
        keyGenerator: (req) => req.ip,
      })
    );
    app.get('/', (req, res) => res.send('ok'));
  });

  it('allows one request', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
    expect(res.headers['x-ratelimit-limit']).toBe('1');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('blocks second request with 429', async () => {
    await request(app).get('/'); // first
    const res = await request(app).get('/'); // second
    expect(res.status).toBe(429);
    expect(res.body).toEqual(expect.objectContaining({ error: 'Too many requests' }));
    expect(res.body).toHaveProperty('retryAfter');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
    expect(res.headers['retry-after']).toBeDefined();
  });
});
