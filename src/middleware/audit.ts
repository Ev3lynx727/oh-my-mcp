import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../logger.js';

const logger = getLogger().child({ component: 'audit' });

/**
 * Audit middleware for management API.
 *
 * Logs state-changing operations (server start/stop/restart, bulk operations).
 * Includes timestamp, action, serverId, token (masked), status, error if any.
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Determine if this request should be audited
  const method = req.method;
  const path = req.path;

  // We only care about POST state changes
  const shouldAudit = method === 'POST' && (
    path.startsWith('/servers/') && (
      path.endsWith('/start') ||
      path.endsWith('/stop') ||
      path.endsWith('/restart')
    ) ||
    path === '/servers/_start-all' ||
    path === '/servers/_stop-all'
  );

  if (!shouldAudit) {
    return next();
  }

  const startTime = Date.now();
  const token = req.headers.authorization || '';
  const maskedToken = token.length > 8 ? token.slice(0, 8) + '...' : token;

  // Capture response when finished
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const serverId = (req.params as any).id || 'multiple';
    const action = path.split('/').pop() || 'unknown';

    const logFields: any = {
      timestamp: new Date().toISOString(),
      type: 'audit',
      action,
      serverId,
      token: maskedToken,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip,
    };

    if (res.statusCode >= 400) {
      // Error: we might want to capture error message
      // Since error handler may modify response, we can't easily get original error here.
      // For now just log with error level.
      logger.warn(logFields, 'Audit log (failed)');
    } else {
      logger.info(logFields, 'Audit log');
    }
  });

  next();
}
