import { ServerTransport } from "./Transport.js";
import { MCPServer } from "./Server.js";

/**
 * BackendClient wraps a running MCP server + its transport.
 *
 * Provides a simple interface for sending JSON-RPC requests
 * to a specific backend server without knowing transport details.
 */
export interface BackendClient {
  /** Unique server identifier */
  readonly serverId: string;

  /** Send a JSON-RPC request and return the parsed response */
  sendRequest(request: any): Promise<any>;

  /** Whether this backend is healthy and can accept requests */
  isHealthy(): boolean;

  /** Close/cleanup this backend client */
  close(): Promise<void>;
}

/**
 * SimpleBackendClient wraps an existing MCPServer + ServerTransport pair.
 *
 * This is the primary BackendClient implementation for M0 — it delegates
 * to the existing transport layer without reimplementing stdio handling.
 */
export class SimpleBackendClient implements BackendClient {
  readonly serverId: string;
  private server: MCPServer;
  private transport: ServerTransport;

  constructor(serverId: string, server: MCPServer, transport: ServerTransport) {
    this.serverId = serverId;
    this.server = server;
    this.transport = transport;
  }

  async sendRequest(request: any): Promise<any> {
    if (!this.server.isRunning()) {
      throw new Error(`Backend ${this.serverId} is not running`);
    }
    return this.transport.sendRequest(this.server, request);
  }

  isHealthy(): boolean {
    // The MCP Host attempts requests directly; degraded mode handles failures.
    // We only require the server process to be running — we don't gate on the
    // periodic HealthChecker state (which may be stale or absent at request time).
    return this.server.isRunning();
  }

  async close(): Promise<void> {
    // SimpleBackendClient doesn't own the server lifecycle —
    // ServerManager handles start/stop. This is a no-op.
  }
}
