import { readFileSync, existsSync, watchFile } from "fs";
import { parse } from "path";
import { Config, ConfigSchema } from "./config.js";
import { getLogger } from "./logger.js";

let config: Config | null = null;
let configPath: string;
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

export function watchConfig(callback: (config: Config) => void) {
  if (!configPath) return;

  watchFile(configPath, { interval: 1000 }, async () => {
    try {
      const newConfig = await loadConfig(configPath);
      callback(newConfig);
      logger.info("Config hot-reloaded");
    } catch (err) {
      logger.error({ err }, "Failed to reload config");
    }
  });
}

export async function reloadConfig(): Promise<Config> {
  return loadConfig(configPath);
}
