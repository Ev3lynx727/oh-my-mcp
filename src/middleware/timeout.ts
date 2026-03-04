import { Request, Response, NextFunction } from 'express';

/**
 * Timeout middleware for Express.
 *
 * If the request does not complete within the specified time, returns 504.
 *
 * @param ms - Timeout in milliseconds (default 60000)
 */
export function timeoutMiddleware(ms: number = 60000): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      if (!res.headersSent) {
        res.status(504).json({ error: 'Gateway timeout', detail: `Request exceeded ${ms}ms` });
      } else {
        // Headers already sent; force close connection
        res.destroy();
      }
    }, ms);

    // Clear timeout on finish/close
    const clear = () => {
      if (timeout) clearTimeout(timeout);
    };
    res.on('finish', clear);
    res.on('close', clear);

    // Override res.end/res.send to check timeout? Not needed; we rely on finish event.
    next();
  };
}
