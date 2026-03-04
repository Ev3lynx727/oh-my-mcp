import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { timeoutMiddleware } from '../../src/middleware/timeout.js';

describe('timeoutMiddleware', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    // Use short timeout for tests (100ms)
    app.use(timeoutMiddleware(100));
    app.get('/fast', (req, res) => res.send('ok'));
    app.get('/slow', (req, res) => {
      // Simulate slow response that won't finish before timeout
      setTimeout(() => res.send('slow'), 200);
    });
  });

  it('should allow request to complete within timeout', async () => {
    const res = await request(app).get('/fast').expect(200);
    expect(res.text).toBe('ok');
  });

  it('should return 504 when request exceeds timeout', async () => {
    // Use a dummy agent to avoid test hanging? supertest enforces own timeout too, but we'll wait short.
    const res = await request(app).get('/slow').expect(504);
    expect(res.body).toEqual({ error: 'Gateway timeout', detail: 'Request exceeded 100ms' });
  });

  it('should clear timeout on response finish', async () => {
    // That's implicitly tested by fast request not timing out
    const start = Date.now();
    await request(app).get('/fast');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100);
  });
});
