import { getLogger } from "../../logger.js";
import { MCPServer } from "../../domain/Server.js";
import { HttpClient, HttpError } from "../../infrastructure/http/HttpClient.js";
import { ServerTransport } from "../../domain/Transport.js";

const logger = getLogger();

/**
 * SuperGatewayTransport communicates with an MCP server via HTTP.
 *
 * Assumes the server is already running (started by ProcessManager) and listening on a port.
 * Uses supergateway's streamableHttp endpoint at `http://127.0.0.1:${port}/mcp`.
 */
export class SuperGatewayTransport implements ServerTransport {
  constructor(private httpClient: HttpClient) { }

  async isReady(server: MCPServer, timeoutMs?: number): Promise<boolean> {
    const port = server.getPort();
    if (!port) {
      return false;
    }

    const timeout = timeoutMs || 30000;
    const start = Date.now();
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "oh-my-mcp-health", version: "1.0.0" }
      }
    };

    while (Date.now() - start < timeout) {
      try {
        const response = await this.httpClient.post(`http://127.0.0.1:${port}/mcp`, body, { timeout: 5000 });
        if (response.ok || response.status === 400 || response.status === 406) {
          return true;
        }
      } catch (err: any) {
        if (err instanceof HttpError && (err.status === 400 || err.status === 406)) {
          return true;
        }
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
      const response = await this.httpClient.post(
        `http://127.0.0.1:${port}/mcp`,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        },
        {
          timeout: server.getTimeout(),
        }
      );
      return response.ok;
    } catch (err: any) {
      if (err instanceof HttpError && (err.status === 400 || err.status === 406)) {
        return true;
      }
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

    const response = await this.httpClient.post(`http://127.0.0.1:${port}/mcp`, request, {
      timeout: server.getTimeout(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const responseText = await response.text();
    const lines = responseText.split('\\n');
    let dataPayload = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataPayload = line.slice(6);
        break; // SSE data found
      }
    }

    if (!dataPayload) {
      // It might be pure JSON (if transport ever changes)
      try {
        return JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Failed to parse response: ${responseText}`);
      }
    }

    return JSON.parse(dataPayload);
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
