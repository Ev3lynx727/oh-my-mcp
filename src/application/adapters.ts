/**
 * Adapters for converting between domain models and legacy interfaces.
 *
 * This file provides bridge functions to gradually migrate from the old
 * ServerState/ServerConfig tuple to the new MCPServer domain model.
 *
 * These adapters will be removed once migration is complete (Phase 2).
 */

import { MCPServer } from '../domain/Server.js';
import { ServerState, ServerConfig as LegacyServerConfig } from '../config.js';

/**
 * Convert a legacy ServerConfig into a domain ServerConfig.
 *
 * @param legacyConfig - The old ServerConfig format from config.ts
 * @param serverId - The server ID (used if name is missing)
 * @returns A domain ServerConfig ready for MCPServer
 */
export function adaptLegacyConfig(
  legacyConfig: LegacyServerConfig,
  serverId: string
): Parameters<typeof MCPServer.fromRawConfig>[0] {
  return {
    id: serverId,
    name: serverId, // legacy config doesn't have separate name field
    command: legacyConfig.command,
    env: legacyConfig.env || {},
    timeout: legacyConfig.timeout || 60000,
    port: legacyConfig.port,
    enabled: legacyConfig.enabled !== false,
    transport: legacyConfig.transport as "supergateway" | "stdio" | undefined,
    healthCheck: legacyConfig.healthCheck,
  };
}

/**
 * Convert an MCPServer to a legacy ServerState object.
 *
 * Used when external code expects the old interface.
 * Omits the process (not serializable) and protects sensitive env vars.
 *
 * @param server - The domain MCPServer instance
 * @returns A legacy-compatible ServerState
 */
export function adaptToLegacyState(server: MCPServer): ServerState {
  const domainState = (server as any).state; // Access internal state for now
  const domainConfig = server.getConfiguration();

  // Build legacy config with required fields (transport has default, but we provide it explicitly)
  const legacyConfig: LegacyServerConfig = {
    command: domainConfig.command,
    env: domainConfig.env,
    timeout: domainConfig.timeout,
    port: domainConfig.port,
    enabled: domainConfig.enabled,
    // transport is required because of default, but may be undefined if domain config didn't set; default to supergateway
    transport: domainConfig.transport ?? 'supergateway',
  };

  // healthCheck is optional; only add if defined
  if (domainConfig.healthCheck) {
    legacyConfig.healthCheck = domainConfig.healthCheck;
  }

  return {
    id: server.id,
    name: server.name,
    config: legacyConfig,
    status: domainState.status,
    port: domainState.port,
    // process is omitted (not serializable and shouldn't be exposed)
    error: domainState.error,
    startedAt: domainState.startedAt,
    health: domainState.health,
  };
}

/**
 * Check if a value is an MCPServer instance.
 *
 * @param server - The server to check
 * @returns true if it's a domain MCPServer, false if legacy plain object
 */
export function isDomainServer(server: any): server is MCPServer {
  return server instanceof MCPServer;
}
