import { ServerTransport } from "../../domain/Transport.js";
import { SuperGatewayTransport } from "./SuperGatewayTransport.js";
import { DirectStdioTransport } from "./DirectStdioTransport.js";
import { HttpClient } from "../../infrastructure/http/HttpClient.js";

export type TransportType = "supergateway" | "stdio";

/**
 * Factory for creating ServerTransport instances.
 *
 * SuperGatewayTransport requires HttpClient; other transports may have their own dependencies.
 */
export class TransportFactory {
  constructor(private httpClient: HttpClient) {}

  /**
   * Create a transport instance by type.
   *
   * @param type - Transport type (default: "supergateway")
   * @returns ServerTransport implementation
   */
  createTransport(type: TransportType = "supergateway"): ServerTransport {
    switch (type) {
      case "supergateway":
        return new SuperGatewayTransport(this.httpClient);
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
   * @returns ServerTransport
   */
  createFromConfig(configTransport?: string): ServerTransport {
    const type = (configTransport as TransportType) || "supergateway";
    if (type !== "supergateway" && type !== "stdio") {
      throw new Error(`Invalid transport type in config: ${type}`);
    }
    return this.createTransport(type);
  }
}
