import type { Config } from "../../config.js";
import { ConfigSchema } from "../../config.js";
import { getLogger } from "../../logger.js";

const logger = getLogger();

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
}

export interface ValidationOptions {
  validateBeforeApply: boolean;
  rollbackOnError: boolean;
  warnOnMissingServers: boolean;
}

const DEFAULT_OPTIONS: ValidationOptions = {
  validateBeforeApply: true,
  rollbackOnError: true,
  warnOnMissingServers: true,
};

export function validateConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  try {
    ConfigSchema.parse(config);
  } catch (err: any) {
    if (err.errors) {
      for (const issue of err.errors) {
        const path = issue.path.join(".");
        errors.push({
          path: path || "root",
          message: issue.message,
        });
      }
    } else {
      errors.push({
        path: "root",
        message: err.message || "Unknown validation error",
      });
    }
  }

  const typedConfig = config as Config;

  if (typedConfig && typedConfig.servers) {
    const serverIds = Object.keys(typedConfig.servers);
    
    if (serverIds.length === 0) {
      warnings.push({
        path: "servers",
        message: "No servers configured",
      });
    }

    for (const [id, serverConfig] of Object.entries(typedConfig.servers)) {
      if (!serverConfig.command || serverConfig.command.length === 0) {
        warnings.push({
          path: `servers.${id}.command`,
          message: "No command specified - server may not start",
        });
      }

      if (serverConfig.port) {
        if (serverConfig.port < 1 || serverConfig.port > 65535) {
          errors.push({
            path: `servers.${id}.port`,
            message: `Invalid port ${serverConfig.port} - must be between 1 and 65535`,
          });
        }
      }

      if (serverConfig.healthCheck) {
        if (serverConfig.healthCheck.interval < 1000) {
          warnings.push({
            path: `servers.${id}.healthCheck.interval`,
            message: "Health check interval < 1000ms may cause excessive load",
          });
        }
        if (serverConfig.healthCheck.unhealthyThreshold < 1) {
          errors.push({
            path: `servers.${id}.healthCheck.unhealthyThreshold`,
            message: "unhealthyThreshold must be at least 1",
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function validateConfigAsync(config: unknown): Promise<ValidationResult> {
  return validateConfig(config);
}

export class ConfigValidator {
  private options: ValidationOptions;
  private lastValidConfig: Config | null = null;

  constructor(options: Partial<ValidationOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async validateAndApply(
    newConfigRaw: unknown,
    applyFn: (config: Config) => Promise<void>
  ): Promise<{ success: boolean; usedFallback: boolean; error?: string }> {
    if (!this.options.validateBeforeApply) {
      const config = newConfigRaw as Config;
      this.lastValidConfig = config;
      await applyFn(config);
      return { success: true, usedFallback: false };
    }

    const validation = validateConfig(newConfigRaw);

    if (!validation.valid) {
      const errorMsg = validation.errors.map((e) => `${e.path}: ${e.message}`).join(", ");
      logger.error({ errors: validation.errors }, "Config validation failed");

      if (this.options.rollbackOnError && this.lastValidConfig) {
        logger.warn("Rolling back to last valid config");
        await applyFn(this.lastValidConfig);
        return { success: false, usedFallback: true, error: errorMsg };
      }

      return { success: false, usedFallback: false, error: errorMsg };
    }

    if (validation.warnings.length > 0) {
      for (const warn of validation.warnings) {
        logger.warn({ path: warn.path, message: warn.message }, "Config validation warning");
      }
    }

    const config = newConfigRaw as Config;
    this.lastValidConfig = config;
    await applyFn(config);

    return { success: true, usedFallback: false };
  }

  setLastValidConfig(config: Config): void {
    this.lastValidConfig = config;
  }

  getLastValidConfig(): Config | null {
    return this.lastValidConfig;
  }

  getOptions(): ValidationOptions {
    return { ...this.options };
  }

  updateOptions(options: Partial<ValidationOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

export function formatValidationErrors(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push("Validation Errors:");
    for (const err of result.errors) {
      lines.push(`  - [${err.path}] ${err.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("\nWarnings:");
    for (const warn of result.warnings) {
      lines.push(`  - [${warn.path}] ${warn.message}`);
    }
  }

  return lines.join("\n");
}
