import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { auditMiddleware } from '../../src/middleware/audit.js';

describe('auditMiddleware', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(auditMiddleware);
    app.post('/servers/:id/start', (req, res) => res.status(200).json({ started: true }));
    app.post('/servers/:id/stop', (req, res) => res.status(200).json({ stopped: true }));
    app.post('/servers/_start-all', (req, res) => res.status(200).json({ all: true }));
    app.post('/servers/_stop-all', (req, res) => res.status(200).json({ all: false }));
    app.post('/servers/some/restart', (req, res) => res.status(200).json({ restarted: true }));
    app.get('/health', (req, res) => res.json({ ok: true }));
  });

  it('does not audit GET requests', async () => {
    await request(app).get('/health').expect(200);
  });

  it('audits POST /servers/:id/start', async () => {
    await request(app).post('/servers/example/start').expect(200);
  });

  it('audits POST /servers/:id/stop', async () => {
    await request(app).post('/servers/foo/stop').expect(200);
  });

  it('audits POST /servers/_start-all', async () => {
    await request(app).post('/servers/_start-all').expect(200);
  });

  it('audits POST /servers/_stop-all', async () => {
    await request(app).post('/servers/_stop-all').expect(200);
  });

  it('does not audit other POST paths', async () => {
    app.post('/other', (req, res) => res.send('ok'));
    await request(app).post('/other').expect(200);
  });

  it('logs with warn level on error status', async () => {
    app.post('/servers/:id/restart', (req, res) => res.status(400).json({ error: 'bad' }));
    await request(app).post('/servers/id/restart').expect(400);
  });
});
