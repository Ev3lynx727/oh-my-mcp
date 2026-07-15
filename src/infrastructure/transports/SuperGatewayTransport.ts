import { getLogger } from "../../logger.js";
import { MCPServer } from "../../domain/Server.js";
import { HttpClient } from "../../infrastructure/http/HttpClient.js";
import { ServerTransport } from "../../domain/Transport.js";

const logger = getLogger();

/**
 * Parse an MCP response that may be raw JSON or SSE-framed.
 * supergateway streamableHttp returns `event: message\ndata: {json}\n\n`.
 */
export function parseMcpResponse(text: string): any {
  const trimmed = text.trim();
  if (!trimmed.includes("data:")) {
    return JSON.parse(trimmed);
  }
  const data = trimmed
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  return JSON.parse(data);
}

/**
 * SuperGatewayTransport communicates with an MCP server via HTTP.
 *
 * Assumes the server is already running (started by ProcessManager) and listening on a port.
 * Uses supergateway's streamableHttp endpoint at `http://127.0.0.1:${port}/mcp`.
 *
 * In stateful mode (--stateful), the first POST (initialize) returns an Mcp-Session-Id header.
 * All subsequent requests include that header to reuse the same child process session.
 */
export class SuperGatewayTransport implements ServerTransport {
  private sessionId: string | null = null;
  private sessionStore?: {
    get: (id: string) => string | undefined;
    set: (id: string, sid: string | null) => void;
  };
  private serverId?: string;

  constructor(
    private httpClient: HttpClient,
    sessionStore?: {
      get: (id: string) => string | undefined;
      set: (id: string, sid: string | null) => void;
    }
  ) {
    this.sessionStore = sessionStore;
  }

  async isReady(server: MCPServer, timeoutMs?: number): Promise<boolean> {
    const port = server.getPort();
    if (!port) {
      return false;
    }

    const timeout = timeoutMs || 30000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const response = await this.httpClient.get(`http://127.0.0.1:${port}/healthz`, { timeout: 5000 });
        if (response.ok) {
          return true;
        }
      } catch {
        // continue polling
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  async healthCheck(server: MCPServer): Promise<boolean> {
    const port = server.getPort();
    if (!port) {
      return false;
    }

    try {
      const response = await this.httpClient.get(`http://127.0.0.1:${port}/healthz`, { timeout: 5000 });
      return response.ok;
    } catch (err: any) {
      logger.debug(
        { server: server.id, err: err instanceof Error ? err.message : String(err) },
        "Health check failed"
      );
      return false;
    }
  }

  // Per-request timeout. Distinct from the stateful session timeout
  // (server.getTimeout(), 10-15min) — a laggy backend's internal API
  // must fail fast, not hang the whole session for the session timeout.
  // ponytail: 15s is generous for a local supergateway child; tune down
  // if internal APIs are expected to be snappier.
  private static readonly REQUEST_TIMEOUT_MS = 15000;

  async sendRequest(server: MCPServer, request: any): Promise<any> {
    const port = server.getPort();
    if (!port) {
      throw new Error(`Server ${server.id} has no port assigned`);
    }

    // Resolve session from the shared store (set during initialize)
    if (this.sessionStore && this.serverId) {
      this.sessionId = this.sessionStore.get(this.serverId) ?? null;
    }

    // initialize starts a fresh session — never send a stale session id
    const isInitialize = request?.method === "initialize";
    if (isInitialize) {
      this.sessionId = null;
    }

    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId && !isInitialize) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const response = await this.httpClient.post(
      `http://127.0.0.1:${port}/mcp`,
      request,
      { timeout: SuperGatewayTransport.REQUEST_TIMEOUT_MS, headers }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      // Session expired or invalid — reset so next call re-initializes
      if (response.status === 400) {
        this.sessionId = null;
        if (this.sessionStore && this.serverId) {
          this.sessionStore.set(this.serverId, null);
        }
      }
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    // Capture session ID from response headers (set on initialize)
    const sid = response.headers?.get?.("mcp-session-id");
    if (sid) {
      this.sessionId = sid;
      if (this.sessionStore && this.serverId) {
        this.sessionStore.set(this.serverId, sid);
      }
    }

    // supergateway streamableHttp returns SSE-framed responses
    // (event: message\ndata: {json}). Raw JSON is also handled as fallback.
    const text = await response.text();
    return parseMcpResponse(text);
  }

  getEndpoint(server: MCPServer): string {
    const port = server.getPort();
    if (!port) {
      throw new Error(`Server ${server.id} has no port assigned`);
    }
    return `http://127.0.0.1:${port}/mcp`;
  }

  usesPort(): boolean {
    return true;
  }

  canProxy(): boolean {
    // The 8090 gateway is a stateless forwarder and cannot manage the
    // initialize→tools/list→tools/call session lifecycle that stateful
    // streamableHttp requires. Clients must use the MCP Host on the
    // management port (/mcp/server) instead. (stdio servers ARE proxied.)
    return false;
  }

  /** Bind this transport to a specific server id for session-store lookup */
  setServerId(id: string): void {
    this.serverId = id;
  }
}
