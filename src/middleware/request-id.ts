import { randomUUID } from "crypto";
import pino from "pino";
import type { Request, Response, NextFunction } from "express";

/**
 * Request ID middleware.
 *
 * Generates a unique ID for each incoming request and attaches it to:
 * - Response header: X-Request-ID
 * - Request object (req.id)
 * - Logger context (req.log = logger.child({ requestId }))
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Generate a UUID (or nanoid) - using crypto.randomUUID for built-in
  const requestId = req.headers["x-request-id"] as string | undefined || randomUUID();

  // Attach to request object for downstream use
  (req as any).id = requestId;

  // Set response header
  res.setHeader("X-Request-ID", requestId);

  // Create child logger with request ID bound
  const baseLogger = req.app.get("logger") as pino.Logger | undefined;
  if (baseLogger) {
    (req as any).log = baseLogger.child({ requestId });
  } else {
    // Fallback to regular pino if no base logger stored
    (req as any).log = pino({ level: "info" }).child({ requestId });
  }

  next();
}
