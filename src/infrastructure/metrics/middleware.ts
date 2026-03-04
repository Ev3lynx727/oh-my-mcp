import { Request, Response, NextFunction } from 'express';
import { getMetrics } from './metrics';

/**
 * Middleware to record HTTP request metrics.
 *
 * Records:
 * - Total requests (counter)
 * - Request duration (histogram)
 * - Errors (counter on unhandled errors)
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const metrics = getMetrics();
  const start = Date.now();
  const method = req.method;
  const route = req.route?.path || req.path;

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;

    try {
      metrics.recordRequest(method, route, statusCode);
      metrics.observeDuration(method, route, durationMs / 1000);
    } catch (err) {
      // Should never happen, but avoid infinite loops
    }
  });

  next();
}

/**
 * Error handling middleware to record errors.
 *
 * Place after all other routes; catches unhandled errors.
 */
export function metricsErrorMiddleware(err: Error, req: Request, res: Response, next: NextFunction): void {
  const metrics = getMetrics();
  try {
    // Determine context: route or path
    const route = req.route?.path || req.path;
    metrics.recordError(err.name || 'Error', route);
  } catch {
    // ignore
  }
  next(err);
}

/**
 * Metrics endpoint handler.
 *
 * GET /metrics
 * Returns text/plain; version=0.0.4; Content-Type: text/plain
 */
export async function metricsHandler(req: Request, res: Response): Promise<void> {
  const metrics = getMetrics();
  try {
    const content = await metrics.metrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(content);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate metrics', details: err.message });
  }
}
