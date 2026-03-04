import pino from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error";

let logger: pino.Logger;

export function initLogger(level: LogLevel = "info") {
  logger = pino({
    level,
  });
  return logger;
}

export function getLogger(): pino.Logger {
  if (!logger) {
    logger = initLogger();
  }
  return logger;
}
