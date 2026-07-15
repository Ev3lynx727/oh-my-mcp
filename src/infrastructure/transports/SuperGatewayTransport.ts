import { getLogger } from "../../logger.js";
import { MCPServer } from "../../domain/Server.js";
import { HttpClient } from "../../infrastructure/http/HttpClient.js";
import { ServerTransport } from "../../domain/Transport.js";

const logger = getLogger();

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

  constructor(private httpClient: HttpClient) { }

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

  async sendRequest(server: MCPServer, request: any): Promise<any> {
    const port = server.getPort();
    if (!port) {
      throw new Error(`Server ${server.id} has no port assigned`);
    }

    const headers: Record<string, string> = {};
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const response = await this.httpClient.post(
      `http://127.0.0.1:${port}/mcp`,
      request,
      { timeout: server.getTimeout(), headers }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      // Session expired or invalid — reset so next call re-initializes
      if (response.status === 400) {
        this.sessionId = null;
      }
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    // Capture session ID from response headers (set on initialize)
    const sid = response.headers?.get?.("mcp-session-id");
    if (sid) {
      this.sessionId = sid;
    }

    // Stateful streamableHttp returns raw JSON-RPC — no SSE wrapping
    const text = await response.text();
    return JSON.parse(text);
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
}
