import { MCPServer } from "../../domain/Server.js";
import { ServerTransport } from "../../domain/Transport.js";

/**
 * DirectStdioTransport is a placeholder for servers that communicate via stdio only.
 *
 * This transport is not fully implemented yet. To use stdio-native MCP servers:
 * - ProcessManager would need to spawn them directly (without supergateway)
 * - Transport would need to handle JSON-RPC over stdin/stdout
 *
 * For now, methods throw errors to indicate unsupported usage.
 */
export class DirectStdioTransport implements ServerTransport {
  // readonly transportName = "stdio";

  usesPort(): boolean {
    return false;
  }

  getEndpoint(server: MCPServer): string {
    return "stdio";
  }

  async isReady(server: MCPServer, timeoutMs?: number): Promise<boolean> {
    throw new Error("DirectStdioTransport.isReady not implemented");
  }

  async healthCheck(server: MCPServer): Promise<boolean> {
    throw new Error("DirectStdioTransport.healthCheck not implemented");
  }

  async sendRequest(server: MCPServer, request: any): Promise<any> {
    throw new Error("DirectStdioTransport.sendRequest not implemented");
  }
}
