import express from "express";
import { loadConfig, watchConfig, shutdownWatcher } from "./config_loader.js";
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
import compression from "compression";
import { timeoutMiddleware } from "./middleware/timeout.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { auditMiddleware } from "./middleware/audit.js";
import { requestResponseLogging } from "./middleware/logging.js";
import { parseCliArgs, showHelp, showVersion } from "./cli/schemas.js";
import { diffServerConfigs, shouldRestartServer, reloadServersWithStrategy, ConfigValidator } from "./infrastructure/config/index.js";
import { getConfig } from "./config_loader.js";

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseCliArgs(args);

  if (parsed.help) {
    showHelp();
    process.exit(0);
  }

  if (parsed.version) {
    showVersion();
    process.exit(0);
  }

  const configPath = parsed.configPath;
  console.log(`Loading config from: ${configPath}`);

  // Load and validate config with error handling
  let config;
  try {
    config = await loadConfig(configPath);
  } catch (err) {
    // Initialize minimal logger to report config error
    initLogger('error');
    const tempLogger = getLogger();
    tempLogger.error({
      error: err instanceof Error ? err.message : String(err),
      configPath,
    }, "Configuration validation failed");
    process.exit(1);
  }

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

  // Management API app
  const managementApp = express();
  managementApp.set("logger", logger);
  managementApp.use(express.json());
  managementApp.use(requestIdMiddleware);
  // Request/Response logging
  managementApp.use(requestResponseLogging);

  managementApp.get("/health", (req, res) => {
    res.json({ status: "ok", servers: manager.getAllServers().length });
  });

  managementApp.get("/", (req, res) => {
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
  // Global request timeout for management API (2 minutes)
  managementApp.use(timeoutMiddleware(120000));
  // Enable compression in prod (disable in dev)
  if (process.env.NODE_ENV !== 'development' && config.compression !== false) {
    managementApp.use(compression({ threshold: 1024 })); // 1KB
  }
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
  // Rate limiting: 100 req/min per IP on management API
  managementApp.use(rateLimit({
    windowMs: 60_000,
    max: 100,
    keyGenerator: (req) => req.ip || 'unknown',
  }));
  // Audit logging for state-changing operations
  managementApp.use(auditMiddleware);
  managementApp.use(createManagementAPI(manager));
  managementApp.use(errorHandler);

  // Gateway API app
  const gatewayApp = express();
  gatewayApp.set("logger", logger);
  gatewayApp.use(express.json());
  gatewayApp.use(requestIdMiddleware);
  // Request/Response logging
  gatewayApp.use(requestResponseLogging);
  // Global request timeout for gateway API (60 seconds)
  gatewayApp.use(timeoutMiddleware(60000));
  if (process.env.NODE_ENV !== 'development' && config.compression !== false) {
    gatewayApp.use(compression({ threshold: 1024 })); // 1KB
  }
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
  // Rate limiting: 1000 req/min per token on gateway API
  gatewayApp.use(rateLimit({
    windowMs: 60_000,
    max: 1000,
    keyGenerator: (req) => {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        return auth.slice(7);
      }
      // Fallback to IP if no token (should not occur when auth enabled)
      return req.ip || 'unknown';
    },
  }));
  gatewayApp.use(createGatewayAPI(manager));
  gatewayApp.use(errorHandler);



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

  // Config validator for hot reload
  const configValidator = new ConfigValidator({
    validateBeforeApply: true,
    rollbackOnError: true,
    warnOnMissingServers: true,
  });
  configValidator.setLastValidConfig(config);

  // Hot reload with smart diff, graceful rolling restart, and validation
  await watchConfig(async (newConfig) => {
    // Validate before applying
    const validationResult = await configValidator.validateAndApply(
      newConfig,
      async (validatedConfig) => {
        const oldConfig = getConfig();
        const diff = diffServerConfigs(oldConfig, validatedConfig);

        logger.info(
          { added: diff.added, removed: diff.removed, modified: diff.modified },
          "Config changed, calculating diff..."
        );

        const toRestart = diff.modified.filter((id) => shouldRestartServer(diff, id));
        const noRestart = diff.modified.filter((id) => !shouldRestartServer(diff, id));

        for (const id of noRestart) {
          logger.info({ server: id, changes: diff.details[id] }, "Server config updated (no restart needed)");
        }

        const result = await reloadServersWithStrategy(
          manager,
          validatedConfig,
          diff.added,
          diff.removed,
          toRestart,
          {
            strategy: "graceful",
            staggerDelay: 1000,
            maxConcurrent: 2,
          }
        );

        logger.info(
          { stopped: result.stopped, started: result.started, restarted: result.restarted, failed: result.failed, duration: result.duration },
          "Config reload complete"
        );
      }
    );

    if (!configValidator.getLastValidConfig()) {
      configValidator.setLastValidConfig(config);
    }

    if (!validationResult.success) {
      logger.error({ error: validationResult.error, usedFallback: validationResult.usedFallback }, "Config reload failed");
    }
  });

  // Graceful shutdown with timeout
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Received termination signal, shutting down...");
    
    // Stop config watcher first
    await shutdownWatcher();
    
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
