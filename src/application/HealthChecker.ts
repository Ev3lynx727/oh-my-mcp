import { MCPServer } from "../domain/Server.js";
import { HealthStatus } from "../domain/ServerStatus.js";
import type { HttpClient } from "../infrastructure/http/HttpClient.js";

/**
 * HealthChecker performs periodic health checks on MCP servers.
 *
 * Responsibilities:
 * - Send MCP `tools/list` request to the server's /mcp endpoint
 * - Determine health based on response (ok vs error/timeout)
 - Track consecutive failures and surface via return value
 * - Independent of ServerManager; can be used by other services
 */
export class HealthChecker {
  private httpClient: HttpClient;
  private defaultTimeout: number;

  constructor(httpClient: HttpClient, defaultTimeout: number = 5000) {
    this.httpClient = httpClient;
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Check the health of a server by sending an MCP tools/list request.
   *
   * @param server - The domain MCPServer to check
   * @param timeoutMs - Optional per-call timeout (overrides default)
   * @returns true if healthy, false otherwise
   */
  async check(server: MCPServer, timeoutMs?: number): Promise<boolean> {
    const port = server.getPort();
    if (!port) {
      return false;
    }

    const timeout = timeoutMs ?? this.defaultTimeout;

    try {
      const response = await this.httpClient.post(
        `http://localhost:${port}/mcp`,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        },
        { timeout }
      );

      // Consider 2xx as healthy; MCP servers return 200 or 400 for some errors
      const healthy = response.ok && (response.status === 200 || response.status === 400);
      return healthy;
    } catch (error: any) {
      // Network error, timeout, or non-2xx response
      return false;
    }
  }

  /**
   * Get the configured health check interval for a server.
   * Falls back to server's healthCheck config or default 30s.
   */
  getInterval(server: MCPServer): number {
    return server.getConfiguration().healthCheck?.interval ?? 30000;
  }

  /**
   * Get the configured health check timeout for a server.
   * Falls back to provided default or 5s.
   */
  getTimeout(server: MCPServer): number {
    return server.getConfiguration().healthCheck?.timeout ?? this.defaultTimeout;
  }

  /**
   * Get the unhealthy threshold for a server.
   */
  getUnhealthyThreshold(server: MCPServer): number {
    return server.getConfiguration().healthCheck?.unhealthyThreshold ?? 3;
  }
}
