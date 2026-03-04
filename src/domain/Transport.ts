import { MCPServer } from "./Server.js";

/**
 * ServerTransport abstracts communication with a running MCP server.
 *
 * Different transports:
 * - SuperGatewayTransport: HTTP communication (via supergateway's streamableHttp)
 * - DirectStdioTransport: stdio communication (for native stdio MCP servers)
 *
 * Note: Process lifecycle (spawn/kill) is handled by ProcessManager.
 * Transport focuses on request/response and health probing after the server is running.
 */
export interface ServerTransport {
  /**
   * Check if the server is ready to accept MCP requests.
   *
   * Typically this means the server responds to an initialize request.
   *
   * @param server - The domain MCPServer
   * @param timeoutMs - Optional timeout (default per server or 30s)
   * @returns true if ready, false otherwise
   */
  isReady(server: MCPServer, timeoutMs?: number): Promise<boolean>;

  /**
   * Perform a health check.
   *
   * Usually a lightweight MCP method like tools/list.
   *
   * @param server - The domain MCPServer
   * @returns true if healthy, false otherwise
   */
  healthCheck(server: MCPServer): Promise<boolean>;

  /**
   * Send a JSON-RPC request and get the parsed response.
   *
   * @param server - The domain MCPServer
   * @param request - JSON-RPC request object { jsonrpc, id, method, params }
   * @returns JSON-RPC response object
   */
  sendRequest(server: MCPServer, request: any): Promise<any>;

  /**
   * Get the endpoint URL or identifier for this server.
   *
   * For HTTP transports: `http://localhost:${port}/mcp`
   * For stdio transports: `stdio` (or another identifier)
   */
  getEndpoint(server: MCPServer): string;

  /**
   * Whether this transport uses a network port (HTTP-based).
   *
   * If true, the server should have an allocated port and the port should be released on stop if auto-allocated.
   */
  usesPort(): boolean;
}
