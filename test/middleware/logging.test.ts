import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import * as loggerModule from '../../src/logger.js';
import { requestResponseLogging } from '../../src/middleware/logging.js';

describe('requestResponseLogging', () => {
  let app: express.Express;
  let mockLogger: any;
  let mockChild: any;

  beforeEach(() => {
    mockChild = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
    mockLogger = { child: vi.fn(() => mockChild) };
    vi.spyOn(loggerModule, 'getLogger').mockReturnValue(mockLogger);

    app = express();
    app.use(requestResponseLogging);
    app.get('/ok', (req, res) => res.json({ ok: true }));
    app.get('/error', (req, res) => res.status(500).send('error'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs debug on request start and info on success', async () => {
    await request(app).get('/ok');
    expect(mockChild.debug).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/ok' }),
      'request started'
    );
    expect(mockChild.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/ok', statusCode: 200 }),
      'request completed'
    );
    expect(mockChild.warn).not.toHaveBeenCalled();
  });

  it('logs warn on error response', async () => {
    await request(app).get('/error');
    expect(mockChild.warn).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/error', statusCode: 500 }),
      'request completed'
    );
    expect(mockChild.info).not.toHaveBeenCalled();
  });
});
