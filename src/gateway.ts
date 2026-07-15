import express, { Request, Response, NextFunction } from "express";
import { ServerManager } from "./server_manager.js";
import { getLogger } from "./logger.js";
import { Config } from "./config.js";

const logger = getLogger();

export function createGatewayAPI(manager: ServerManager, config: Config) {
  const router = express.Router();

  router.use(async (req: Request, res: Response, _next: NextFunction) => {
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

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed. Use POST for JSON-RPC" });
    }

    const server = manager.getServer(serverId);

    if (!server) {
      return res.status(404).json({ error: `Server '${serverId}' not found` });
    }

    if (server.status !== "running") {
      return res.status(503).json({ error: `Server '${serverId}' is not running (status: ${server.status})` });
    }

    try {
      const mcpResult = await manager.proxyMCPRequest(serverId, req.body);
      if (mcpResult === null) {
        return res.status(502).json({ error: "Server not available" });
      }
      if (mcpResult.handled) {
        res.status(mcpResult.status);
        for (const [k, v] of Object.entries(mcpResult.headers)) res.setHeader(k, v);
        return res.json(mcpResult.body);
      }
    } catch (err: any) {
      logger.error({ server: serverId, error: err.message }, "MCP proxy request failed");
      return res.status(502).json({ error: err.message });
    }

    // If we get here, proxyMCPRequest returned { handled: false }, meaning
    // the transport cannot be proxied by the gateway (e.g. stdio transport).
    // Clients should use the MCP Host on the management port instead.
    return res.status(501).json({
      error: "Server transport is not proxied by this gateway. Use the MCP Host at http://localhost:" + config.managementPort + "/mcp/server",
    });
  });

  return router;
}
