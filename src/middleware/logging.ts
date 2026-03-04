import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../logger.js';

/**
 * Middleware that logs HTTP requests and responses.
 *
 * - Log at start (debug) with method, path, query.
 * - Log at finish (info for success, warn for 4xx/5xx) with status, duration.
 *
 * Attaches request ID if available (via request-id middleware).
 */
export function requestResponseLogging(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const reqLog = (req as any).log || getLogger().child({ reqId: (req as any).id });

  // Debug log on request start
  reqLog.debug({
    method: req.method,
    path: req.path,
    query: req.query,
  }, 'request started');

  // Log when response finishes
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level = (res.statusCode >= 400) ? 'warn' : 'info';
    reqLog[level]({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
    }, 'request completed');
  });

  next();
}
