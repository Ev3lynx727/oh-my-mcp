import express from "express";
import { loadConfig, watchConfig } from "./config_loader.js";
import { initLogger, getLogger } from "./logger.js";
import { Container } from "./di/container.js";
import { AppModule } from "./di/modules/app.module.js";
import { ServerManager } from "./server_manager.js";
import { createAuthMiddleware } from "./auth.js";
import { createManagementAPI } from "./api.js";
import { createGatewayAPI } from "./gateway.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { metricsMiddleware, metricsErrorMiddleware, metricsHandler } from "./infrastructure/metrics/middleware.js";
import { getMetrics } from "./infrastructure/metrics/metrics.js";

async function main() {
  const args = process.argv.slice(2);
  const configPath = args[0] || "./config.yaml";

  console.log(`Loading config from: ${configPath}`);
  const config = await loadConfig(configPath);

  initLogger(config.logLevel || "info");
  const logger = getLogger();

  logger.info({
    managementPort: config.managementPort,
    gatewayPort: config.gatewayPort,
    servers: Object.keys(config.servers).length,
  }, "Starting oh-my-mcp");

  // Setup DI container
  const container = new Container();
  AppModule.register(container);

  // Resolve ServerManager from container
  const manager = container.resolve<ServerManager>(ServerManager);

  // Main app (health and root)
  const app = express();
  app.use(express.json());
  app.set("logger", logger);
  app.use(requestIdMiddleware);
  // Simple request log (debug)
  app.use((req, res, next) => {
    const reqLog = (req as any).log || logger;
    reqLog.debug({ method: req.method, path: req.path }, "Incoming request");
    next();
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", servers: manager.getAllServers().length });
  });

  app.get("/", (req, res) => {
    res.json({
      name: "oh-my-mcp",
      version: "1.0.0",
      managementPort: config.managementPort,
      gatewayPort: config.gatewayPort,
      endpoints: {
        management: `http://localhost:${config.managementPort}`,
        gateway: `http://localhost:${config.gatewayPort}/mcp/:serverId`,
      },
    });
  });

  // Management API app
  const managementApp = express();
  managementApp.set("logger", logger);
  managementApp.use(requestIdMiddleware);
  // Metrics instrumentation (no auth required for /metrics)
  managementApp.use(metricsMiddleware);
  managementApp.get('/metrics', async (req, res) => {
    const metrics = getMetrics();
    // Update server count gauges
    metrics.updateServerCounts(manager.getAllServers());
    try {
      const content = await metrics.metrics();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(content);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to generate metrics', details: err.message });
    }
  });
  managementApp.use(metricsErrorMiddleware);
  // Auth and API
  managementApp.use(createAuthMiddleware(config.auth));
  managementApp.use(createManagementAPI(manager));
  managementApp.use(errorHandler);

  // Gateway API app
  const gatewayApp = express();
  gatewayApp.set("logger", logger);
  gatewayApp.use(requestIdMiddleware);
  gatewayApp.use(metricsMiddleware);
  gatewayApp.get('/metrics', async (req, res) => {
    const metrics = getMetrics();
    metrics.updateServerCounts(manager.getAllServers());
    try {
      const content = await metrics.metrics();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(content);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to generate metrics', details: err.message });
    }
  });
  gatewayApp.use(metricsErrorMiddleware);
  gatewayApp.use(createAuthMiddleware(config.auth));
  gatewayApp.use(createGatewayAPI(manager));
  gatewayApp.use(errorHandler);

  // Root app also needs error handler after routes
  app.use(errorHandler);

  // Start servers
  managementApp.listen(config.managementPort, () => {
    logger.info({ port: config.managementPort }, "Management API listening");
  });

  gatewayApp.listen(config.gatewayPort, () => {
    logger.info({ port: config.gatewayPort }, "Gateway API listening");
  });

  // Auto-start enabled servers
  for (const [id, serverConfig] of Object.entries(config.servers)) {
    if (serverConfig.enabled !== false) {
      logger.info({ server: id }, "Auto-starting server");
      manager.startServer(id, serverConfig).catch((err) => {
        logger.error({ server: id, error: err.message }, "Failed to auto-start server");
      });
    }
  }

  // Hot reload
  watchConfig(async (newConfig) => {
    logger.info("Config changed, reloading...");

    const shouldRun = new Set<string>();
    for (const [id, cfg] of Object.entries(newConfig.servers)) {
      if (cfg.enabled !== false) shouldRun.add(id);
    }

    const currentServers = manager.getAllServers();
    for (const server of currentServers) {
      const id = server.id;
      if (!shouldRun.has(id)) {
        logger.info({ server: id }, "Stopping server removed or disabled in new config");
        try {
          await manager.stopServer(id);
        } catch (err: any) {
          logger.error({ server: id, error: err.message }, "Failed to stop server during config reload");
        }
      }
    }

    for (const [id, serverConfig] of Object.entries(newConfig.servers)) {
      if (serverConfig.enabled !== false) {
        const existing = manager.getServer(id);
        const isRunning = existing && (existing.status === 'running' || existing.status === 'starting');
        if (!isRunning) {
          try {
            await manager.startServer(id, serverConfig);
          } catch (err: any) {
            logger.error({ server: id, error: err.message }, "Failed to start server from config reload");
          }
        }
      }
    }
  });

  // Graceful shutdown with timeout
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Received termination signal, shutting down...");
    const timeoutMs = 10000;
    const stopPromise = manager.stopAll();
    const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));

    const start = Date.now();
    await Promise.race([stopPromise, timeoutPromise]);
    const elapsed = Date.now() - start;

    if (elapsed >= timeoutMs) {
      logger.warn({ signal }, `Shutdown timed out after ${timeoutMs}ms, some servers may still be running`);
    } else {
      logger.info({ signal, elapsed }, "All servers stopped cleanly");
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
