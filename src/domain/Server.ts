import { ServerConfig, ServerState, ServerStatus, HealthStatus, ServerInfo } from './ServerStatus.js';
import { EventEmitter } from 'events';

/**
 * MCPServer is the root domain entity representing an MCP server instance.
 *
 * It encapsulates:
 * - Configuration (immutable)
 * - Runtime state (mutable)
 * - Business logic (state transitions, health checks, request eligibility)
 *
 * This class enforces invariants and rules about server lifecycle.
 *
 * Example:
 * ```typescript
 * const server = MCPServer.fromConfig({
 *   id: 'github',
 *   name: 'GitHub MCP',
 *   command: ['npx', '@modelcontextprotocol/server-github'],
 *   env: { GITHUB_TOKEN: '...' },
 *   timeout: 60000,
 *   enabled: true
 * });
 *
 * await server.start(processManager);
 * if (server.canAcceptRequests()) {
 *   // proxy request to server
 * }
 * ```
 */
export class MCPServer extends EventEmitter {
  /** Immutable configuration */
  private readonly config: ServerConfig;

  /** Mutable runtime state */
  private state: ServerState;

  /** Track health check failures for threshold logic */
  private consecutiveHealthFailures: number = 0;

  constructor(config: ServerConfig, state: ServerState = { status: ServerStatus.STOPPED, port: 0 }) {
    super();
    this.config = {
      // Ensure id is set
      id: config.id,
      // Name defaults to id if not provided
      name: config.name || config.id,
      // Required fields
      command: config.command,
      env: config.env || {},
      timeout: config.timeout || 60000,
      // Optional fields
      port: config.port ?? 0,
      enabled: config.enabled !== false, // default true
      transport: config.transport,
      healthCheck: config.healthCheck,
    };
    this.state = {
      ...state,
      status: state.status || ServerStatus.STOPPED,
      port: state.port || (config.port ?? 0),
    };
  }

  // ============ Accessors (read-only) ============

  /** Get the server's unique identifier */
  get id(): string {
    return this.config.id;
  }

  /** Get the display name */
  get name(): string {
    return this.config.name;
  }

  /** Get the configuration (immutable) */
  getConfiguration(): ServerConfig {
    return this.config;
  }

  /** Get current status */
  getStatus(): ServerStatus {
    return this.state.status;
  }

  /** Get the port this server is listening on (0 if not allocated) */
  getPort(): number {
    return this.state.port;
  }

  /** Get the child process if running */
  getProcess(): import('child_process').ChildProcess | undefined {
    return this.state.process;
  }

  /** Get error message if status is ERROR */
  getError(): string | undefined {
    return this.state.error;
  }

  /** Get startup timestamp */
  getStartedAt(): Date | undefined {
    return this.state.startedAt;
  }

  /** Get health status */
  getHealth(): HealthStatus | undefined {
    return this.state.health;
  }

  /** Get the command to execute */
  getCommand(): string[] {
    return this.config.command;
  }

  /** Get resolved environment variables */
  getResolvedEnv(): Record<string, string> {
    return this.config.env;
  }

  /** Get timeout in ms */
  getTimeout(): number {
    return this.config.timeout;
  }

  /** Get transport type */
  getTransport(): "supergateway" | "stdio" {
    return this.config.transport || 'supergateway';
  }

  /** Check if server is enabled in config */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ============ State Predicates ============

  /**
   * Check if the server is currently running.
   * A server is running if it has status RUNNING and process exists.
   */
  isRunning(): boolean {
    return this.state.status === ServerStatus.RUNNING && this.state.process !== undefined;
  }

  /**
   * Check if the server is in a terminal error state.
   */
  isInError(): boolean {
    return this.state.status === ServerStatus.ERROR;
  }

  /**
   * Check if the server is stopped (not running, not starting, not error recovery).
   */
  isStopped(): boolean {
    return this.state.status === ServerStatus.STOPPED;
  }

  /**
   * Check if the server is currently starting up.
   */
  isStarting(): boolean {
    return this.state.status === ServerStatus.STARTING;
  }

  /**
   * Check if the server is healthy based on last health check.
   * If no health check has been performed, returns false.
   */
  isHealthy(): boolean {
    return this.state.health?.ok ?? false;
  }

  /**
   * Check if the server can accept MCP requests.
   *
   * Requirements:
   * - Must be RUNNING
   * - Must have a health check that passed recently (within 2x healthCheck.interval)
   * - Must not be in error state
   */
  canAcceptRequests(): boolean {
    if (!this.isRunning()) return false;
    if (this.isInError()) return false;

    const health = this.state.health;
    if (!health) return false; // No health check yet

    // Check if health is recent (within 2x the configured interval)
    const interval = this.config.healthCheck?.interval || 30000;
    const ageMs = Date.now() - health.lastCheck.getTime();
    if (ageMs > interval * 2) {
      return false; // Health is stale
    }

    return health.ok;
  }

  // ============ State Transitions ============

  /**
   * Transition to STARTING state.
   * Should be called before attempting to start the process.
   *
   * Throws if not currently STOPPED.
   */
  markStarting(): void {
    if (this.state.status !== ServerStatus.STOPPED) {
      throw new Error(`Cannot mark server ${this.id} as STARTING from status ${this.state.status}`);
    }
    this.state.status = ServerStatus.STARTING;
    this.emit('statusChange', this.state.status);
  }

  /**
   * Assign an allocated port to this server before it starts listening.
   *
   * Used by ServerManager when a port is reserved for this server instance.
   * Can only be called while server is in STARTING state.
   */
  setAllocatedPort(port: number): void {
    if (this.state.status !== ServerStatus.STARTING) {
      throw new Error(`Cannot set port for server ${this.id} in status ${this.state.status}`);
    }
    this.state.port = port;
  }

  /**
   * Transition to RUNNING state with allocated port and process.
   *
   * Throws if not currently STARTING.
   */
  markRunning(port: number, process: import('child_process').ChildProcess): void {
    if (this.state.status !== ServerStatus.STARTING) {
      throw new Error(`Cannot mark server ${this.id} as RUNNING from status ${this.state.status}`);
    }
    this.state.port = port;
    this.state.process = process;
    this.state.status = ServerStatus.RUNNING;
    this.state.startedAt = new Date();
    this.state.error = undefined;
    this.consecutiveHealthFailures = 0;
    this.emit('statusChange', this.state.status);
  }

  /**
   * Transition to ERROR state with an error message.
   *
   * The process may or may not be set (could have failed to start).
   */
  markError(error: string, process?: import('child_process').ChildProcess): void {
    this.state.status = ServerStatus.ERROR;
    this.state.error = error;
    if (process) {
      this.state.process = process;
    }
    this.emit('statusChange', this.state.status);
    this.emit('error', error);
  }

  /**
   * Transition to STOPPED state.
   * Clears process and port (if auto-allocated).
   */
  markStopped(): void {
    const wasRunning = this.isRunning();
    this.state.status = ServerStatus.STOPPED;
    this.state.process = undefined;
    this.state.health = undefined;
    this.consecutiveHealthFailures = 0;

    // Clear port if it was auto-allocated (config.port is undefined)
    if (this.config.port === undefined) {
      this.state.port = 0;
    }

    this.emit('statusChange', this.state.status);
  }

  /**
   * Update health status based on a check.
   *
   * Tracks consecutive failures and can transition to ERROR if threshold exceeded.
   *
   * @param healthy - Whether the server is healthy
   * @param message - Optional error message if unhealthy
   */
  updateHealth(healthy: boolean, message?: string): void {
    const now = new Date();
    this.state.health = { ok: healthy, lastCheck: now, message };

    if (healthy) {
      this.consecutiveHealthFailures = 0;
    } else {
      this.consecutiveHealthFailures++;
      const threshold = this.config.healthCheck?.unhealthyThreshold || 3;

      if (this.consecutiveHealthFailures >= threshold) {
        this.markError(`Unhealthy after ${this.consecutiveHealthFailures} failed health checks${message ? `: ${message}` : ''}`);
      }
    }

    this.emit('healthChange', this.state.health);
  }

  /**
   * Reset health tracking (useful after manual restart).
   */
  resetHealth(): void {
    this.consecutiveHealthFailures = 0;
    this.state.health = undefined;
  }

  // ============ Factory Methods ============

  /**
   * Create an MCPServer from a raw configuration object.
   *
   * This is the primary factory method for creating servers from user config.
   * The config should already be validated (e.g., by Zod) but we normalize it here.
   *
   * @param rawConfig - Raw configuration (may have partial fields)
   * @param state - Optional existing state (for reconstruction)
   * @returns A new MCPServer instance
   */
  static fromRawConfig(rawConfig: any, state: Partial<ServerState> = {}): MCPServer {
    const config: ServerConfig = {
      id: rawConfig.id || rawConfig.name,
      name: rawConfig.name || rawConfig.id,
      command: rawConfig.command,
      env: rawConfig.env || {},
      timeout: rawConfig.timeout || 60000,
      port: rawConfig.port,
      enabled: rawConfig.enabled !== false,
      transport: rawConfig.transport,
      healthCheck: rawConfig.healthCheck,
    };

    const mergedState: ServerState = {
      status: ServerStatus.STOPPED,
      port: config.port ?? 0,
      ...state,
    };

    return new MCPServer(config, mergedState);
  }

  /**
   * Reconstruct an MCPServer from persisted state and config.
   *
   * Used when restoring server state after restart or from persistence.
   */
  static fromState(state: ServerState & { config: ServerConfig }): MCPServer {
    const server = new MCPServer(state.config, {
      status: state.status,
      port: state.port,
      process: state.process,
      error: state.error,
      startedAt: state.startedAt,
      health: state.health,
    });
    return server;
  }

  /**
   * Create a minimal MCPServer with just an ID (for references).
   *
   * Useful when you need a server identifier without full config.
   */
  static withId(id: string): MCPServer {
    return new MCPServer({
      id,
      name: id,
      command: [],
      env: {},
      timeout: 60000,
      enabled: true,
    });
  }

  // ============ Serialization ============

  /**
   * Serialize to plain object (for logging, API responses).
   * Excludes the process (not serializable).
   */
  toJSON(): Omit<ServerState, 'process'> & { config: ServerConfig } {
    return {
      config: this.config,
      status: this.state.status,
      port: this.state.port,
      error: this.state.error,
      startedAt: this.state.startedAt,
      health: this.state.health,
    };
  }

  /**
   * Create a DTO suitable for API responses.
   * Masks sensitive env vars and omits internal fields.
   */
  toAPIDTO(): Record<string, any> {
    return {
      id: this.config.id,
      name: this.config.name,
      status: this.state.status,
      port: this.state.port,
      error: this.state.error,
      health: this.state.health,
      startedAt: this.state.startedAt,
      config: {
        command: this.config.command,
        timeout: this.config.timeout,
        enabled: this.config.enabled,
        transport: this.config.transport,
        // Don't expose env vars in API (could have secrets)
        // env: this.config.env ? Object.keys(this.config.env).reduce((acc, key) => {
        //   acc[key] = this.config.env[key] ? '***' : undefined;
        //   return acc;
        // }, {} as Record<string, string>) : undefined,
      },
    };
  }
}
