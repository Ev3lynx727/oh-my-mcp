import express, { Request, Response, NextFunction } from "express";
import { ServerManager } from "./server_manager.js";
import { getConfig } from "./config_loader.js";
import { getLogger } from "./logger.js";
import { ServerIdSchema, ListServersQuerySchema, validationErrorToResponse } from "./api/schemas.js";

const logger = getLogger();

function validateServerId(req: Request, res: Response, next: NextFunction): void {
  const result = ServerIdSchema.safeParse(req.params);
  if (!result.success) {
    res.status(400).json(validationErrorToResponse(result));
    return;
  }
  next();
}

export function createManagementAPI(manager: ServerManager) {
  const router = express.Router();

  // List all servers
  router.get("/servers", async (req: Request, res: Response) => {
    const queryResult = ListServersQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json(validationErrorToResponse(queryResult));
      return;
    }
    
    const { status, limit, offset } = queryResult.data;
    const servers = manager.getAllServers();
    const config = getConfig();

    const result = servers.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      port: s.port,
      error: s.error,
      health: s.health,
      startedAt: s.startedAt,
      config: {
        command: s.config.command,
        timeout: s.config.timeout,
        enabled: s.config.enabled,
      },
    }));

    const configServers = Object.keys(config.servers).filter(
      (k) => !result.find((r) => r.id === k)
    );

    for (const id of configServers) {
      result.push({
        id,
        name: id,
        status: "stopped",
        port: config.servers[id].port || 0,
        error: undefined,
        health: undefined,
        startedAt: undefined,
        config: config.servers[id],
      });
    }

    let filtered = result;
    if (status && status !== "all") {
      filtered = result.filter(s => s.status === status);
    }
    
    const paginated = filtered.slice(offset, offset + limit);
    
    res.json({ servers: paginated, total: filtered.length });
  });

  // Get server details
  router.get("/servers/:id", validateServerId, async (req: Request, res: Response) => {
    const { id } = req.params;
    const server = manager.getServer(id);

    if (!server) {
      const config = getConfig();
      if (!config.servers[id]) {
        return res.status(404).json({ error: "Server not found" });
      }
      return res.json({
        id,
        name: id,
        status: "stopped",
        config: config.servers[id],
      });
    }

    res.json({
      id: server.id,
      name: server.name,
      status: server.status,
      port: server.port,
      error: server.error,
      health: server.health,
      startedAt: server.startedAt,
      config: server.config,
    });
  });

  // Create/start server
  router.post("/servers/:id/start", validateServerId, async (req: Request, res: Response) => {
    const { id } = req.params;
    const config = getConfig();

    if (!config.servers[id]) {
      return res.status(404).json({ error: "Server config not found" });
    }

    try {
      await manager.startServer(id, config.servers[id]);
      res.json({ id, status: "running" });
    } catch (err: any) {
      logger.error({ server: id, error: err.message }, "Failed to start server");
      res.status(500).json({ error: err.message });
    }
  });

  // Stop server
  router.post("/servers/:id/stop", validateServerId, async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      await manager.stopServer(id);
      res.json({ id, status: "stopped" });
    } catch (err: any) {
      logger.error({ server: id, error: err.message }, "Failed to stop server");
      res.status(500).json({ error: err.message });
    }
  });

  // Restart server
  router.post("/servers/:id/restart", validateServerId, async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      await manager.restartServer(id);
      res.json({ id, status: "running" });
    } catch (err: any) {
      logger.error({ server: id, error: err.message }, "Failed to restart server");
      res.status(500).json({ error: err.message });
    }
  });

  // Get server logs
  router.get("/servers/:id/logs", validateServerId, async (req: Request, res: Response) => {
    const { id } = req.params;
    const server = manager.getServer(id);

    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const listener = (type: string, data: string) => {
      res.write(`[${type}] ${data}\n`);
    };

    manager.on("log", (sid: string, type: string, data: string) => {
      if (sid === id) {
        res.write(`[${type}] ${data}\n`);
      }
    });

    res.on("close", () => {
      manager.off("log", listener);
    });
  });

  // Health check
  router.get("/servers/:id/health", validateServerId, async (req: Request, res: Response) => {
    const { id } = req.params;
    const server = manager.getServer(id);

    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    const healthy = await manager.healthCheck(id);
    res.json({
      id,
      healthy,
      lastCheck: server.health?.lastCheck,
    });
  });

  // Get server MCP info (tools, resources, prompts)
  router.get("/servers/:id/info", validateServerId, async (req: Request, res: Response) => {
    const { id } = req.params;
    const info = await manager.getServerInfo(id);

    if (!info) {
      return res.status(404).json({ error: "Server not found or not running" });
    }

    res.json(info);
  });

  // Start all configured servers
  router.post("/servers/_start-all", async (req: Request, res: Response) => {
    const config = getConfig();
    const results: { id: string; status: string; error?: string }[] = [];

    for (const [id, serverConfig] of Object.entries(config.servers)) {
      if (serverConfig.enabled === false) {
        results.push({ id, status: "disabled", error: "Disabled in config" });
        continue;
      }

      try {
        await manager.startServer(id, serverConfig);
        results.push({ id, status: "running" });
      } catch (err: any) {
        results.push({ id, status: "error", error: err.message });
      }
    }

    res.json({ results });
  });

  // Stop all servers
  router.post("/servers/_stop-all", async (req: Request, res: Response) => {
    await manager.stopAll();
    res.json({ status: "stopped" });
  });

  return router;
}
