import express, { Request, Response, NextFunction } from "express";
import { ServerManager } from "./server_manager.js";
import { getLogger } from "./logger.js";
import http from "http";

const logger = getLogger();

export function createGatewayAPI(manager: ServerManager) {
  const router = express.Router();

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    console.log(`[GATEWAY] ${req.method} ${req.path} Authorization: ${req.headers.authorization ? 'present' : 'missing'}`);
    const path = req.path;

    let serverId: string | undefined;

    if (path.startsWith("/mcp/")) {
      serverId = path.split("/")[2];
    } else if (path === "/mcp") {
      serverId = req.headers["x-mcp-server"] as string;
    }

    if (!serverId) {
      return res.status(400).json({ error: "Missing server ID. Use /mcp/:serverId or X-MCP-Server header" });
    }

    const server = manager.getServer(serverId);

    if (!server) {
      return res.status(404).json({ error: `Server '${serverId}' not found` });
    }

    if (server.status !== "running") {
      return res.status(503).json({ error: `Server '${serverId}' is not running (status: ${server.status})` });
    }

    const targetPort = server.port;
    const targetPath = "/mcp";
    
    const options = {
      hostname: "localhost",
      port: targetPort,
      path: targetPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: undefined,
        accept: 'application/json, text/event-stream',
      },
      timeout: 30000,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.status(proxyRes.statusCode || 500);
      proxyRes.headers["content-type"] && res.setHeader("content-type", proxyRes.headers["content-type"]);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      logger.error({ server: serverId, error: err.message }, "Proxy error");
      res.status(502).json({ error: "Bad gateway" });
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      res.status(504).json({ error: "Gateway timeout" });
    });

    req.pipe(proxyReq);
  });

  return router;
}
