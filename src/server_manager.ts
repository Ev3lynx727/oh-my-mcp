import type { ServerConfig as LegacyServerConfig, ServerState as LegacyServerState, MCPServerInfo } from "./config.js";
import { getLogger } from "./logger.js";
import { MCPServer } from "./domain/Server.js";
import { adaptLegacyConfig, adaptToLegacyState } from "./application/adapters.js";
import { ServerStatus } from "./domain/ServerStatus.js";
import { ProcessManager } from "./application/ProcessManager.js";
import { PortAllocator } from "./application/PortAllocator.js";
import { EventBus } from "./application/EventBus.js";
import { TransportFactory } from "./infrastructure/transports/TransportFactory.js";
import { ServerTransport } from "./domain/Transport.js";

const logger = getLogger();

/**
 * ServerManager manages the lifecycle of MCP servers.
 *
 * Uses domain model (MCPServer) internally.
 * Communicates via EventBus instead of extending EventEmitter.
 *
 * Public API remains backward compatible.
 */
export class ServerManager {
  private servers: Map<string, MCPServer> = new Map();
  private transports: Map<string, ServerTransport> = new Map();
  private basePort: number;
  private portAllocator: PortAllocator;
  private processManager: ProcessManager;
  private eventBus: EventBus;
  private transportFactory: TransportFactory;
  private bridgedServers: Set<string> = new Set();

  constructor(
    eventBus: EventBus,
    portAllocator: PortAllocator,
    processManager: ProcessManager,
    transportFactory: TransportFactory,
    basePort?: number
  ) {
    this.eventBus = eventBus;
    this.portAllocator = portAllocator;
    this.processManager = processManager;
    this.transportFactory = transportFactory;
    this.basePort = basePort ?? 8100;
  }

  // Backward compatibility: proxy EventEmitter methods to internal EventBus
  public on(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventBus.on(event, listener);
    return this;
  }
  public off(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventBus.off(event, listener);
    return this;
  }
  public once(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventBus.once(event, listener);
    return this;
  }
  public removeAllListeners(event?: string | symbol): this {
    this.eventBus.removeAllListeners(event);
    return this;
  }

  private resolveEnv(env: Record<string, string | undefined>): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (value) {
        if (value.startsWith("{env:") && value.endsWith("}")) {
          const envVar = value.slice(5, -1);
          resolved[key] = process.env[envVar] || "";
        } else {
          resolved[key] = value;
        }
      }
    }
    return resolved;
  }

  async startServer(id: string, legacyConfig: LegacyServerConfig): Promise<void> {
    const existingDomain = this.servers.get(id);
    if (existingDomain?.isRunning()) {
      logger.warn({ server: id }, "Server already running");
      return;
    }

    // Create or update domain server
    let server: MCPServer;
    if (existingDomain) {
      server = existingDomain;
    } else {
      const domainConfig = adaptLegacyConfig(legacyConfig, id);
      server = MCPServer.fromRawConfig(domainConfig);
      this.servers.set(id, server);
    }

    // Bridge domain events (once)
    if (!this.bridgedServers.has(id)) {
      this.setupEventBridge(id, server);
      this.bridgedServers.add(id);
    }

    // Determine port with PortAllocator
    let port: number;
    if (legacyConfig.port !== undefined) {
      port = legacyConfig.port;
      const isSameManualRestart = existingDomain && existingDomain.getPort() === port;
      if (!isSameManualRestart) {
        if (this.portAllocator.isAllocated(port)) {
          throw new Error(`Port ${port} is already in use by another server`);
        }
        this.portAllocator.reserve(port);
      }
    } else {
      port = this.portAllocator.allocate();
    }

    server.markStarting();
    this.eventBus.emit("serverStarting", id);

    try {
      await this.processManager.startServer(server, legacyConfig, port);
      const child = this.processManager.getProcess(id);
      if (!child) {
        throw new Error("Process not found after start");
      }

      (server as any).state.process = child;

      child.stdout?.on('data', (data) => {
        this.eventBus.emit('log', id, 'stdout', data.toString());
      });
      child.stderr?.on('data', (data) => {
        this.eventBus.emit('log', id, 'stderr', data.toString());
      });

      child.on('error', (err: any) => {
        logger.error({ server: id, error: err.message }, "Server process error");
        server.markError(err.message, child);
      });

      child.on('exit', (code: number | null) => {
        logger.info({ server: id, code }, "Server process exited");
        server.markStopped();
        this.transports.delete(id);
        this.eventBus.emit("serverStopped", id, code);

        if (code !== 0) {
          setTimeout(() => {
            const s = this.servers.get(id);
            if (s && s.isEnabled() && !s.isStopped()) {
              this.startServer(id, legacyConfig).catch((err) => {
                logger.error({ server: id, error: err.message }, "Auto-restart failed");
              });
            }
          }, 5000);
        }
      });

      // Create transport and assign port to server before readiness check
      const domainConfig = server.getConfiguration();
      const transport = this.transportFactory.createFromConfig(domainConfig.transport);
      this.transports.set(id, transport);
      server.setAllocatedPort(port);

      // Wait for server to be ready using transport
      await this.waitForServer(id, transport);

      server.markRunning(port, child);
      this.eventBus.emit("serverStarted", id);
      logger.info({ server: id, port }, "Server started successfully");
    } catch (err: any) {
      await this.processManager.stopServer(server).catch(() => {});
      server.markError(err.message);
      throw err;
    }
  }

  private setupEventBridge(id: string, server: MCPServer): void {
    server.on('statusChange', (newStatus: ServerStatus) => {
      if (newStatus === ServerStatus.ERROR) {
        this.eventBus.emit('serverError', id, new Error(server.getError()));
      }
    });
  }

  private async waitForServer(id: string, transport: ServerTransport, timeoutMs?: number): Promise<void> {
    const server = this.servers.get(id);
    if (!server) {
      throw new Error(`Server ${id} not found`);
    }

    const ready = await transport.isReady(server, timeoutMs);
    if (!ready) {
      throw new Error(`Server ${id} failed to become ready within ${timeoutMs ?? 30000}ms`);
    }
  }

  async stopServer(id: string): Promise<void> {
    const domainServer = this.servers.get(id);
    if (!domainServer || domainServer.isStopped()) {
      return;
    }

    logger.info({ server: id }, "Stopping server");

    const port = domainServer.getPort();
    const config = domainServer.getConfiguration();
    const isManual = (config.port ?? 0) > 0;

    await this.processManager.stopServer(domainServer);
    domainServer.markStopped();

    // Clean up transport
    this.transports.delete(id);

    if (!isManual && port > 0) {
      this.portAllocator.release(port);
    }

    this.eventBus.emit("serverStopped", id, 0);
  }

  async restartServer(id: string): Promise<void> {
    const domainServer = this.servers.get(id);
    if (!domainServer) {
      throw new Error(`Server ${id} not found`);
    }

    await this.stopServer(id);
    const legacyConfig = this.domainConfigToLegacy(domainServer.getConfiguration());
    await this.startServer(id, legacyConfig);
  }

  private domainConfigToLegacy(domainConfig: any): LegacyServerConfig {
    return {
      command: domainConfig.command,
      env: domainConfig.env,
      timeout: domainConfig.timeout,
      port: domainConfig.port,
      enabled: domainConfig.enabled,
      transport: domainConfig.transport,
    };
  }

  getServer(id: string): LegacyServerState | undefined {
    const domainServer = this.servers.get(id);
    if (!domainServer) {
      return undefined;
    }
    return adaptToLegacyState(domainServer);
  }

  getDomainServer(id: string): MCPServer | undefined {
    return this.servers.get(id);
  }

  getAllServers(): LegacyServerState[] {
    return Array.from(this.servers.values()).map(server => adaptToLegacyState(server));
  }

  async healthCheck(id: string): Promise<boolean> {
    const domainServer = this.servers.get(id);
    if (!domainServer || !domainServer.isRunning()) {
      return false;
    }

    const transport = this.transports.get(id);
    if (!transport) {
      // Fallback: if no transport (shouldn't happen), return false
      domainServer.updateHealth(false, "No transport available");
      return false;
    }

    try {
      const healthy = await transport.healthCheck(domainServer);
      domainServer.updateHealth(healthy);
      return healthy;
    } catch (error: any) {
      domainServer.updateHealth(false, error.message);
      return false;
    }
  }

  async getServerInfo(id: string): Promise<MCPServerInfo | null> {
    const domainServer = this.servers.get(id);
    if (!domainServer || !domainServer.isRunning()) {
      return null;
    }

    const transport = this.transports.get(id);
    if (!transport) {
      return null;
    }

    try {
      const request = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      };
      const response = await transport.sendRequest(domainServer, request);
      return response.result || {};
    } catch (err: any) {
      logger.error({ server: id, err: err.message }, "Failed to get server info");
      return null;
    }
  }

  async stopAll(): Promise<void> {
    for (const [id] of this.servers) {
      await this.stopServer(id);
    }
  }
}
