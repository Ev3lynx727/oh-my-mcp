import chokidar, { FSWatcher } from "chokidar";
import { getLogger } from "../../logger.js";
import { loadConfig } from "../../config_loader.js";
import type { Config } from "../../config.js";

const logger = getLogger();

export interface WatcherOptions {
  debounceMs?: number;
  awaitWriteFinishMs?: number;
  usePolling?: boolean;
  ignored?: string[];
}

export class ConfigWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private configPath: string;
  private options: Required<WatcherOptions>;

  constructor(configPath: string, options: WatcherOptions = {}) {
    this.configPath = configPath;
    this.options = {
      debounceMs: options.debounceMs ?? 500,
      awaitWriteFinishMs: options.awaitWriteFinishMs ?? 300,
      usePolling: options.usePolling ?? false,
      ignored: options.ignored ?? [
        "*.swp",
        "*.swo",
        "*~",
        ".git/*",
        "node_modules/*",
      ],
    };
  }

  async start(callback: (config: Config) => Promise<void>): Promise<void> {
    if (this.watcher) {
      logger.warn("ConfigWatcher already started");
      return;
    }

    logger.info({ 
      path: this.configPath, 
      options: this.options 
    }, "Starting config watcher with chokidar");

    this.watcher = chokidar.watch(this.configPath, {
      persistent: true,
      usePolling: this.options.usePolling,
      awaitWriteFinish: {
        stabilityThreshold: this.options.awaitWriteFinishMs,
        pollInterval: 100,
      },
      ignored: this.options.ignored,
      ignoreInitial: true,
      atomic: true,
    });

    this.watcher.on("change", async (path) => {
      logger.info({ path }, "Config file changed, debouncing...");
      this.debounce(callback);
    });

    this.watcher.on("add", async (path) => {
      logger.info({ path }, "Config file added");
      this.debounce(callback);
    });

    this.watcher.on("error", (error) => {
      logger.error({ error: error.message }, "Config watcher error");
    });

    this.watcher.on("ready", () => {
      logger.info("Config watcher ready");
    });
  }

  private async debounce(callback: (config: Config) => Promise<void>): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      await this.reloadConfig(callback);
    }, this.options.debounceMs);
  }

  private async reloadConfig(callback: (config: Config) => Promise<void>): Promise<void> {
    try {
      const newConfig = await loadConfig(this.configPath);
      logger.info("Config reloaded successfully");
      await callback(newConfig);
    } catch (err) {
      logger.error({ err }, "Failed to reload config");
    }
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      logger.info("Config watcher stopped");
    }
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }
}

let globalWatcher: ConfigWatcher | null = null;

export async function watchConfig(
  configPath: string,
  callback: (config: Config) => Promise<void>,
  options: WatcherOptions = {}
): Promise<ConfigWatcher> {
  if (globalWatcher) {
    await globalWatcher.stop();
  }

  globalWatcher = new ConfigWatcher(configPath, options);
  await globalWatcher.start(callback);
  return globalWatcher;
}

export async function stopConfigWatcher(): Promise<void> {
  if (globalWatcher) {
    await globalWatcher.stop();
    globalWatcher = null;
  }
}
