import { readFileSync, existsSync } from "fs";
import { parse } from "path";
import { Config, ConfigSchema } from "./config.js";
import { getLogger } from "./logger.js";
import { ConfigWatcher } from "./infrastructure/config/index.js";

let config: Config | null = null;
let configPath: string;
let configWatcher: ConfigWatcher | null = null;
const logger = getLogger();

export async function loadConfig(path: string): Promise<Config> {
  configPath = path;

  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }

  const content = readFileSync(path, "utf-8");
  const ext = parse(path).ext;

  let raw: any;
  if (ext === ".json" || ext === ".jsonc") {
    raw = JSON.parse(content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""));
  } else if (ext === ".yaml" || ext === ".yml") {
    const yaml = await import("yaml");
    raw = yaml.parse(content);
  } else {
    throw new Error(`Unsupported config format: ${ext}`);
  }

  const parsed = ConfigSchema.parse(raw);
  config = parsed;

  logger.info({ servers: Object.keys(parsed.servers) }, "Config loaded");
  return parsed;
}

export function getConfig(): Config {
  if (!config) {
    throw new Error("Config not loaded");
  }
  return config;
}

export async function watchConfig(callback: (config: Config) => void): Promise<void> {
  if (!configPath) {
    logger.warn("No config path set, skipping watch");
    return;
  }

  if (configWatcher) {
    await configWatcher.stop();
  }

  configWatcher = new ConfigWatcher(configPath, {
    debounceMs: 500,
    awaitWriteFinishMs: 300,
    usePolling: false,
    ignored: [
      "*.swp",
      "*.swo",
      "*~",
      ".git/*",
      "node_modules/*",
    ],
  });

  await configWatcher.start(async (newConfig) => {
    callback(newConfig);
  });

  logger.info({ path: configPath }, "Config hot-reload enabled with chokidar");
}

export async function reloadConfig(): Promise<Config> {
  return loadConfig(configPath);
}

export async function shutdownWatcher(): Promise<void> {
  if (configWatcher) {
    await configWatcher.stop();
    configWatcher = null;
  }
}
