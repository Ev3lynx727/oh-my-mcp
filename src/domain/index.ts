/**
 * Domain layer - core business entities and value objects.
 *
 * This layer encapsulates the business logic of MCP server management.
 * It should be independent of infrastructure concerns (process spawning, HTTP, etc.).
 */

export { MCPServer } from './Server.js';
export type {
  ServerConfig,
  ServerState,
  ServerStatus,
  HealthStatus,
  ServerInfo,
} from './ServerStatus.js';
