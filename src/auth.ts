import { Request, Response, NextFunction } from "express";
import { AuthConfig } from "./config.js";
import { getLogger } from "./logger.js";

const logger = getLogger();

export function createAuthMiddleware(auth?: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!auth || (!auth.token && (!auth.tokens || auth.tokens.length === 0))) {
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn({ path: req.path }, "Missing or invalid authorization header");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.slice(7);

    const validTokens = auth.tokens || (auth.token ? [auth.token] : []);
    if (!validTokens.includes(token)) {
      logger.warn({ path: req.path, token: token.slice(0, 8) + "..." }, "Invalid token");
      return res.status(401).json({ error: "Invalid token" });
    }

    next();
  };
}
