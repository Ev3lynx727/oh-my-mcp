import type { Config } from "../../config.js";
import type { ServerManager } from "../../server_manager.js";
import { getLogger } from "../../logger.js";
import { ServerStatus } from "../../domain/ServerStatus.js";

const logger = getLogger();

export interface ReloadOptions {
  strategy: "immediate" | "graceful" | "rolling";
  staggerDelay: number;
  maxConcurrent: number;
}

export interface ReloadResult {
  success: boolean;
  stopped: string[];
  started: string[];
  restarted: string[];
  failed: { id: string; error: string }[];
  duration: number;
}

const DEFAULT_OPTIONS: ReloadOptions = {
  strategy: "graceful",
  staggerDelay: 1000,
  maxConcurrent: 2,
};

export async function reloadServersWithStrategy(
  manager: ServerManager,
  config: Config,
  added: string[],
  removed: string[],
  modified: string[],
  options: Partial<ReloadOptions> = {}
): Promise<ReloadResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  
  const result: ReloadResult = {
    success: true,
    stopped: [],
    started: [],
    restarted: [],
    failed: [],
    duration: 0,
  };

  try {
    switch (opts.strategy) {
      case "immediate":
        return await immediateReload(manager, config, added, removed, modified);
      case "graceful":
        return await gracefulReload(manager, config, added, removed, modified, opts);
      case "rolling":
        return await rollingReload(manager, config, added, removed, modified, opts);
      default:
        return await immediateReload(manager, config, added, removed, modified);
    }
  } finally {
    result.duration = Date.now() - startTime;
  }
}

async function immediateReload(
  manager: ServerManager,
  config: Config,
  added: string[],
  removed: string[],
  modified: string[]
): Promise<ReloadResult> {
  const result: ReloadResult = {
    success: true,
    stopped: [],
    started: [],
    restarted: [],
    failed: [],
    duration: 0,
  };
  const startTime = Date.now();

  for (const id of removed) {
    try {
      await manager.stopServer(id);
      result.stopped.push(id);
    } catch (err: any) {
      result.failed.push({ id, error: err.message });
      result.success = false;
    }
  }

  for (const id of modified) {
    try {
      await manager.stopServer(id);
      await manager.startServer(id, config.servers[id]);
      result.restarted.push(id);
    } catch (err: any) {
      result.failed.push({ id, error: err.message });
      result.success = false;
    }
  }

  for (const id of added) {
    try {
      await manager.startServer(id, config.servers[id]);
      result.started.push(id);
    } catch (err: any) {
      result.failed.push({ id, error: err.message });
      result.success = false;
    }
  }

  result.duration = Date.now() - startTime;
  return result;
}

async function gracefulReload(
  manager: ServerManager,
  config: Config,
  added: string[],
  removed: string[],
  modified: string[],
  opts: ReloadOptions
): Promise<ReloadResult> {
  const result: ReloadResult = {
    success: true,
    stopped: [],
    started: [],
    restarted: [],
    failed: [],
    duration: 0,
  };
  const startTime = Date.now();

  logger.info({ strategy: "graceful", staggerDelay: opts.staggerDelay }, "Starting graceful reload");

  for (const id of removed) {
    try {
      await manager.stopServer(id);
      result.stopped.push(id);
      logger.info({ server: id }, "Stopped server");
    } catch (err: any) {
      result.failed.push({ id, error: err.message });
      logger.error({ server: id, error: err.message }, "Failed to stop server");
    }
    await delay(opts.staggerDelay);
  }

  for (const id of modified) {
    try {
      await manager.stopServer(id);
      await delay(500);
      await manager.startServer(id, config.servers[id]);
      result.restarted.push(id);
      logger.info({ server: id }, "Restarted server");
    } catch (err: any) {
      result.failed.push({ id, error: err.message });
      logger.error({ server: id, error: err.message }, "Failed to restart server");
    }
    await delay(opts.staggerDelay);
  }

  for (const id of added) {
    try {
      await manager.startServer(id, config.servers[id]);
      result.started.push(id);
      logger.info({ server: id }, "Started new server");
    } catch (err: any) {
      result.failed.push({ id, error: err.message });
      logger.error({ server: id, error: err.message }, "Failed to start server");
    }
    await delay(opts.staggerDelay);
  }

  result.success = result.failed.length === 0;
  result.duration = Date.now() - startTime;
  
  logger.info(
    { stopped: result.stopped.length, started: result.started.length, failed: result.failed.length },
    "Graceful reload complete"
  );
  
  return result;
}

async function rollingReload(
  manager: ServerManager,
  config: Config,
  added: string[],
  removed: string[],
  modified: string[],
  opts: ReloadOptions
): Promise<ReloadResult> {
  const result: ReloadResult = {
    success: true,
    stopped: [],
    started: [],
    restarted: [],
    failed: [],
    duration: 0,
  };
  const startTime = Date.now();

  logger.info(
    { strategy: "rolling", staggerDelay: opts.staggerDelay, maxConcurrent: opts.maxConcurrent },
    "Starting rolling reload"
  );

  const processBatch = async (ids: string[], action: "stop" | "restart" | "start") => {
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += opts.maxConcurrent) {
      batches.push(ids.slice(i, i + opts.maxConcurrent));
    }

    for (const batch of batches) {
      const promises = batch.map(async (id) => {
        try {
          if (action === "stop") {
            await manager.stopServer(id);
            result.stopped.push(id);
            logger.info({ server: id }, "Stopped server");
          } else if (action === "restart") {
            await manager.stopServer(id);
            await delay(500);
            await manager.startServer(id, config.servers[id]);
            result.restarted.push(id);
            logger.info({ server: id }, "Restarted server");
          } else if (action === "start") {
            await manager.startServer(id, config.servers[id]);
            result.started.push(id);
            logger.info({ server: id }, "Started server");
          }
        } catch (err: any) {
          result.failed.push({ id, error: err.message });
          logger.error({ server: id, error: err.message }, "Failed to " + action + " server");
        }
      });

      await Promise.all(promises);
      await delay(opts.staggerDelay);
    }
  };

  if (removed.length > 0) {
    await processBatch(removed, "stop");
  }

  if (modified.length > 0) {
    await processBatch(modified, "restart");
  }

  if (added.length > 0) {
    await processBatch(added, "start");
  }

  result.success = result.failed.length === 0;
  result.duration = Date.now() - startTime;
  
  logger.info(
    { stopped: result.stopped.length, started: result.started.length, restarted: result.restarted.length, failed: result.failed.length },
    "Rolling reload complete"
  );
  
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isServerRunning(manager: ServerManager, serverId: string): boolean {
  const server = manager.getServer(serverId);
  return server !== undefined && server.status === ServerStatus.RUNNING;
}
