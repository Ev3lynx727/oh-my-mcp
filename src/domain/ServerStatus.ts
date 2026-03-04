/**
 * ServerStatus represents the lifecycle state of an MCP server.
 *
 * State transitions:
 *   stopped → starting → running → stopped
 *                    ↘
 *                     error → stopped (auto-restart)
 */
export enum ServerStatus {
  STOPPED = "stopped",
  STARTING = "starting",
  RUNNING = "running",
  STOPPING = "stopping", // intermediate state when stopping
  ERROR = "error",
}

/**
 * HealthStatus represents the result of a health check.
 */
export interface HealthStatus {
  /** Whether the server is considered healthy */
  ok: boolean;
  /** When the health check was performed */
  lastCheck: Date;
  /** Optional error message if unhealthy */
  message?: string;
}

/**
 * ServerConfig represents the configuration for an MCP server.
 *
 * This is derived from the user's config.yaml but validated and normalized.
 * It's a value object - immutable once created.
 */
export interface ServerConfig {
  /** Unique identifier for this server */
  readonly id: string;
  /** Display name (defaults to id) */
  readonly name: string;
  /** Command to execute (first element) and arguments (rest) */
  readonly command: string[];
  /** Environment variables for the process */
  readonly env: Record<string, string>;
  /** Timeout in milliseconds for health checks and operations */
  readonly timeout: number;
  /** Explicit port assignment (optional, otherwise auto-allocated) */
  readonly port?: number;
  /** Whether this server should be auto-started */
  readonly enabled: boolean;
  /** Transport type to use (supergateway or stdio) */
  readonly transport?: "supergateway" | "stdio";
  /** Health check configuration */
  readonly healthCheck?: {
    interval: number;
    timeout: number;
    unhealthyThreshold: number;
  };
}

/**
 * ServerState represents the runtime state of an MCP server.
 *
 * This is distinct from ServerConfig because it contains mutable runtime data.
 * The MCPServer class encapsulates both and enforces business rules.
 */
export interface ServerState {
  /** Current status */
  status: ServerStatus;
  /** The port this server is listening on */
  port: number;
  /** Child process (if running) */
  process?: import('child_process').ChildProcess;
  /** Error message if status is ERROR */
  error?: string;
  /** When the server was last started */
  startedAt?: Date;
  /** Last health check result */
  health?: HealthStatus;
}

/**
 * ServerInfo contains discovered information about an MCP server.
 */
export interface ServerInfo {
  /** Available tools */
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: any;
  }>;
  /** Available resources */
  resources?: Array<{
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
  }>;
  /** Available prompts */
  prompts?: Array<{
    name: string;
    description?: string;
  }>;
}
