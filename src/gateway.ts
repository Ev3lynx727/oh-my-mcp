import express, { Request, Response, NextFunction } from "express";
import { createProxyMiddleware, Options } from "http-proxy-middleware";
import { ServerManager } from "./server_manager.js";
import { getLogger } from "./logger.js";

const logger = getLogger();

export function createGatewayAPI(manager: ServerManager) {
  const router = express.Router();

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    console.log(`[GATEWAY] ${req.method} ${req.path} Authorization: ${req.headers.authorization ? 'present' : 'missing'}`);
    logger.debug({ method: req.method, path: req.path, headers: req.headers }, "Gateway request");
    const path = req.path;

    let serverId: string | undefined;

    if (path.startsWith("/mcp/")) {
      serverId = path.split("/")[2]; // /mcp/:serverId -> parts[0]="", parts[1]="mcp", parts[2]=serverId
      logger.debug({ path, serverId }, "Extracted server ID from path");
    } else if (path === "/mcp") {
      serverId = req.headers["x-mcp-server"] as string;
      logger.debug({ path, serverId }, "Using X-MCP-Server header");
    }

    if (!serverId) {
      return res.status(400).json({ error: "Missing server ID. Use /mcp/:serverId or X-MCP-Server header" });
    }

    const server = manager.getServer(serverId);
    logger.debug({ serverId, serverExists: !!server, serverStatus: server?.status }, "Found server");

    if (!server) {
      return res.status(404).json({ error: `Server '${serverId}' not found` });
    }

    if (server.status !== "running") {
      return res.status(503).json({ error: `Server '${serverId}' is not running (status: ${server.status})` });
    }

    const target = `http://localhost:${server.port}`;

    const proxyOptions: Options = {
      target,
      changeOrigin: true,
      pathRewrite: (path: string) => {
        // Rewrite /mcp/:serverId -> /mcp
        if (path.startsWith(`/mcp/${serverId}`)) {
          return path.replace(`/mcp/${serverId}`, "/mcp");
        }
        return path;
      },
    };

    const proxy = createProxyMiddleware(proxyOptions);

    proxy(req, res, (err?: Error) => {
      if (err) {
        logger.error({
          server: serverId,
          error: err.message,
        }, "Proxy error");
        res.status(502).json({ error: "Bad gateway" });
      }
    });
  });

  return router;
}
