import type { Config } from "../../config.js";

export interface ConfigDiff {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: string[];
}

export interface ServerConfigDiff {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: string[];
  details: {
    [serverId: string]: {
      command?: boolean;
      env?: boolean;
      timeout?: boolean;
      port?: boolean;
      enabled?: boolean;
      transport?: boolean;
      healthCheck?: boolean;
    };
  };
}

export function diffConfigs(oldConfig: Config, newConfig: Config): ConfigDiff {
  const oldServers = Object.keys(oldConfig.servers);
  const newServers = Object.keys(newConfig.servers);

  const added = newServers.filter((s) => !oldServers.includes(s));
  const removed = oldServers.filter((s) => !newServers.includes(s));
  const common = newServers.filter((s) => oldServers.includes(s));

  const modified: string[] = [];
  const unchanged: string[] = [];

  for (const serverId of common) {
    if (hasConfigChanged(oldConfig.servers[serverId], newConfig.servers[serverId])) {
      modified.push(serverId);
    } else {
      unchanged.push(serverId);
    }
  }

  return {
    added,
    removed,
    modified,
    unchanged,
  };
}

export function diffServerConfigs(
  oldConfig: Config,
  newConfig: Config
): ServerConfigDiff {
  const oldServers = Object.keys(oldConfig.servers);
  const newServers = Object.keys(newConfig.servers);

  const added = newServers.filter((s) => !oldServers.includes(s));
  const removed = oldServers.filter((s) => !newServers.includes(s));
  const common = newServers.filter((s) => oldServers.includes(s));

  const modified: string[] = [];
  const unchanged: string[] = [];
  const details: ServerConfigDiff["details"] = {};

  for (const serverId of common) {
    const oldServer = oldConfig.servers[serverId];
    const newServer = newConfig.servers[serverId];
    const changes = detectServerChanges(oldServer, newServer);

    if (Object.keys(changes).length > 0) {
      modified.push(serverId);
      details[serverId] = changes;
    } else {
      unchanged.push(serverId);
    }
  }

  return {
    added,
    removed,
    modified,
    unchanged,
    details,
  };
}

function hasConfigChanged(
  oldServer: NonNullable<Config["servers"]>[string],
  newServer: NonNullable<Config["servers"]>[string]
): boolean {
  const changes = detectServerChanges(oldServer, newServer);
  return Object.keys(changes).length > 0;
}

function detectServerChanges(
  oldServer: NonNullable<Config["servers"]>[string],
  newServer: NonNullable<Config["servers"]>[string]
): { [key: string]: boolean } {
  const changes: { [key: string]: boolean } = {};

  if (!arraysEqual(oldServer.command, newServer.command)) {
    changes.command = true;
  }

  if (!objectsEqual(oldServer.env || {}, newServer.env || {})) {
    changes.env = true;
  }

  if (oldServer.timeout !== newServer.timeout) {
    changes.timeout = true;
  }

  if (oldServer.port !== newServer.port) {
    changes.port = true;
  }

  if (oldServer.enabled !== newServer.enabled) {
    changes.enabled = true;
  }

  if (oldServer.transport !== newServer.transport) {
    changes.transport = true;
  }

  if (JSON.stringify(oldServer.healthCheck) !== JSON.stringify(newServer.healthCheck)) {
    changes.healthCheck = true;
  }

  return changes;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function objectsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function shouldRestartServer(
  diff: ServerConfigDiff,
  serverId: string
): boolean {
  const serverChanges = diff.details[serverId];
  if (!serverChanges) return false;

  const restartRequired: { [key: string]: boolean } = {
    command: true,
    env: true,
    port: true,
    transport: true,
  };

  for (const key of Object.keys(serverChanges)) {
    if (restartRequired[key]) {
      return true;
    }
  }

  return false;
}
