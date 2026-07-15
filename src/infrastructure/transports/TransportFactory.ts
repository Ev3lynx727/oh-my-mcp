import { ServerTransport } from "../../domain/Transport.js";
import { SuperGatewayTransport } from "./SuperGatewayTransport.js";
import { DirectStdioTransport } from "./DirectStdioTransport.js";
import { HttpClient } from "../../infrastructure/http/HttpClient.js";
import { ServerManager } from "../../server_manager.js";

export type TransportType = "supergateway" | "stdio";

/**
 * Factory for creating ServerTransport instances.
 *
 * SuperGatewayTransport requires HttpClient; other transports may have their own dependencies.
 * The ServerManager is passed in so transports can share the per-server session store
 * (stateful streamableHttp sessions persist across SimpleBackendClient instances).
 */
export class TransportFactory {
  constructor(
    private httpClient: HttpClient,
    private serverManager?: ServerManager
  ) {}

  /**
   * Inject the ServerManager after construction (resolves circular dep:
   * ServerManager needs TransportFactory, TransportFactory needs ServerManager's session store).
   */
  setServerManager(manager: ServerManager): void {
    this.serverManager = manager;
  }

  /**
   * Create a transport instance by type.
   *
   * @param type - Transport type (default: "supergateway")
   * @param serverId - Server id for session-store binding
   * @returns ServerTransport implementation
   */
  createTransport(type: TransportType = "supergateway", serverId?: string): ServerTransport {
    switch (type) {
      case "supergateway": {
        const t = new SuperGatewayTransport(this.httpClient, this.serverManager ? {
          get: (id) => this.serverManager!.getSessionId(id),
          set: (id, sid) => this.serverManager!.setSessionId(id, sid),
        } : undefined);
        if (serverId) t.setServerId(serverId);
        return t;
      }
      case "stdio":
        return new DirectStdioTransport();
      default:
        throw new Error(`Unknown transport type: ${type}`);
    }
  }

  /**
   * Create transport from server config (reads config.transport field).
   *
   * @param configTransport - Optional transport type from ServerConfig
   * @param serverId - Server id for session-store binding
   * @returns ServerTransport
   */
  createFromConfig(configTransport?: string, serverId?: string): ServerTransport {
    const type = (configTransport as TransportType) || "supergateway";
    if (type !== "supergateway" && type !== "stdio") {
      throw new Error(`Invalid transport type in config: ${type}`);
    }
    return this.createTransport(type, serverId);
  }
}
