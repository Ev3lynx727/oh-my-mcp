import pino from "pino";
import type { Request, Response, NextFunction } from "express";

/**
 * Centralized error handling middleware.
 *
 * Captures errors passed to `next(err)`, logs them with request context,
 * and returns a sanitized JSON response. Production responses hide stack traces.
 *
 * Usage:
 *   app.use(errorHandler);
 *
 * After all routes and other middleware.
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Use request-scoped logger if available, otherwise fallback
  const logger = (req as any).log || pino();

  // Determine status code (default to 500)
  const status = err.status && typeof err.status === "number" ? err.status : 500;

  // Build log payload
  const logPayload: any = {
    method: req.method,
    path: req.path,
    statusCode: status,
    message: err.message,
  };

  // Add request ID if present
  if ((req as any).id) {
    logPayload.requestId = (req as any).id;
  }

  // Log error (level depends on status)
  if (status >= 500) {
    logger.error(logPayload, err);
  } else {
    logger.warn(logPayload, err);
  }

  // Build response (hide stack in production)
  const isProd = process.env.NODE_ENV === "production";
  const response: any = {
    error: err.message || "Internal Server Error",
    status,
  };

  if (!isProd && err.stack) {
    response.stack = err.stack;
  }

  res.status(status).json(response);
}
