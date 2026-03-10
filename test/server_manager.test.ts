import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServerManager } from '../src/server_manager.js';
import { MCPServer } from '../src/domain/Server.js';
import type { LegacyServerConfig } from '../src/config.js';
import type { EventBus } from '../src/application/EventBus.js';
import type { PortAllocator } from '../src/application/PortAllocator.js';
import type { ProcessManager } from '../src/application/ProcessManager.js';
import type { TransportFactory } from '../src/infrastructure/transports/TransportFactory.js';
import type { ServerTransport } from '../src/domain/Transport.js';

function makeLegacyConfig(overrides: Partial<LegacyServerConfig> = {}): LegacyServerConfig {
  return {
    command: ['echo', 'test'],
    env: {},
    timeout: 60000,
    port: 0,
    enabled: true,
    transport: 'supergateway',
    ...overrides,
  };
}

function makeDomainConfig(overrides: any = {}): any {
  return {
    id: 's1',
    name: 'S1',
    command: ['echo', 'test'],
    env: {},
    timeout: 60000,
    port: 0,
    enabled: true,
    transport: 'supergateway',
    ...overrides,
  };
}

describe('ServerManager', () => {
  let manager: ServerManager;
  let eventBus: EventBus;
  let portAllocator: PortAllocator;
  let processManager: ProcessManager;
  let transportFactory: TransportFactory;

  beforeEach(() => {
    eventBus = { emit: vi.fn() } as any;
    portAllocator = {
      allocate: vi.fn(() => 8100),
      release: vi.fn(),
      isAllocated: vi.fn(() => false),
      reserve: vi.fn(),
    } as any;
    processManager = {
      startServer: vi.fn(),
      stopServer: vi.fn().mockResolvedValue(undefined),
      getProcess: vi.fn(),
      isRunning: vi.fn(() => true),
      restartServer: vi.fn(),
    } as any;
    transportFactory = {
      createFromConfig: vi.fn(),
    } as any;

    // We'll need to instantiate ServerManager.
    // But ServerManager's constructor expects these dependencies.
    // However some methods may access private fields. We'll use the real class but with our mocks.
    // We have to import the actual class; it uses these dependencies via constructor.
    // So we can create:
    manager = new ServerManager(
      eventBus,
      portAllocator,
      processManager,
      transportFactory,
      8100
    );
  });

  describe('startServer', () => {
    it('should start server and mark running', async () => {
      // Arrange
      const legacyConfig = makeLegacyConfig({ port: undefined });
      const domainConfig = makeDomainConfig();
      // We need MCPServer.fromRawConfig to be called internally; ServerManager does:
      // let server = existingDomain || MCPServer.fromRawConfig(domainConfig)
      // So we can pre-seed map with an existing domain? No, it's new.
      // But creating MCPServer.fromRawConfig will require the domain config shape. We can mock adaptLegacyConfig to return our domainConfig.
      // Actually we cannot easily intercept that static method. Instead we can create the server ourselves and manually insert into manager.servers? No.
      // Alternative: Provide a test-specific subclass or use dependency injection for Server creation? Not present.
      // Let's examine ServerManager.startServer code: it does:
      //   const existingDomain = this.servers.get(id);
      //   let server: MCPServer;
      //   if (existingDomain) { server = existingDomain; } else {
      //     const domainConfig = adaptLegacyConfig(legacyConfig, id);
      //     server = MCPServer.fromRawConfig(domainConfig);
      //     this.servers.set(id, server);
      //   }
      // So we cannot easily mock MCPServer.fromRawConfig without complex module mocking.
      // But we can test by letting it create a real MCPServer. That's fine as long as we provide a valid domain config.
      // The adaptLegacyConfig function is from `adapters`. We'll need to import it? But we could also pre-seed `manager.servers` with a mock MCPServer that has the necessary methods (markStarting, markRunning, etc.) and `id`.
      // The startServer will see existingDomain if we pre-seed. So we can pre-seed with a mock MCPServer that is STOPPED, and then startServer will use it. That bypasses MCPServer.fromRawConfig.
      // Let's do that: create a mock MCPServer object with needed fields/methods.
      // We'll define a simple class or object:
      const mockServer = {
        id: 's1',
        state: {},
        markStarting: vi.fn(),
        markRunning: vi.fn(),
        markStopping: vi.fn(),
        markStopped: vi.fn(),
        markError: vi.fn(),
        isRunning: vi.fn(() => false),
        isStopped: vi.fn(() => true),
        getPort: vi.fn(() => 0),
        getStatus: vi.fn(() => 'STOPPED'),
        getError: vi.fn(() => null),
        getConfiguration: vi.fn(() => ({
          command: legacyConfig.command,
          env: legacyConfig.env,
          timeout: legacyConfig.timeout,
          port: legacyConfig.port,
          enabled: legacyConfig.enabled,
          transport: legacyConfig.transport,
          healthCheck: legacyConfig.healthCheck,
        })),
        setAllocatedPort: vi.fn(),
        getProcess: vi.fn(() => null),
        on: vi.fn(), // for event bridge
      } as any as MCPServer;
      manager.servers.set('s1', mockServer);

      // Also, we need the manager's setupEventBridge method to be harmless. It sets up event listeners. That should be fine.
      // We need to stub processManager.startServer to return a resolved promise and set a fake child process.
      (processManager.startServer as any).mockResolvedValue(undefined);
      (processManager.getProcess as any).mockReturnValue({ kill: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn() });

      // Transport mock
      const mockTransport = {
        isReady: vi.fn(async () => true),
        healthCheck: vi.fn(async () => true),
        sendRequest: vi.fn(async () => ({ jsonrpc: '2.0', result: {} })),
        getEndpoint: vi.fn(() => 'http://localhost:8100/mcp'),
        usesPort: vi.fn(() => true),
      } as any as ServerTransport;
      (transportFactory.createFromConfig as any).mockReturnValue(mockTransport);

      // Act
      await manager.startServer('s1', legacyConfig);

      // Assert
      expect(processManager.startServer).toHaveBeenCalledWith(mockServer, legacyConfig, 8100);
      expect(mockServer.markStarting).toHaveBeenCalled();
      expect(mockTransport.isReady).toHaveBeenCalled();
      expect(mockServer.setAllocatedPort).toHaveBeenCalledWith(8100);
      expect(mockServer.markRunning).toHaveBeenCalledWith(8100, expect.any(Object));
      expect(manager.transports.get('s1')).toBe(mockTransport);
      expect(eventBus.emit).toHaveBeenCalledWith('serverStarted', 's1');
    });

    it('should not start already running server', async () => {
      const mockServer = {
        id: 's1',
        isRunning: vi.fn(() => true),
        isStopped: vi.fn(() => false),
        markStarting: vi.fn(),
        markRunning: vi.fn(),
        setAllocatedPort: vi.fn(),
        on: vi.fn(), // for event bridge
      } as any as MCPServer;
      manager.servers.set('s1', mockServer);

      await manager.startServer('s1', makeLegacyConfig());
      expect(processManager.startServer).not.toHaveBeenCalled();
    });
  });

  describe('stopServer', () => {
    it('should stop running server and clean up', async () => {
      const mockServer = {
        id: 's1',
        isRunning: vi.fn(() => true),
        isStopped: vi.fn(() => false),
        markStopping: vi.fn(),
        markStopped: vi.fn(),
        getPort: vi.fn(() => 8100),
        getConfiguration: vi.fn(() => ({ port: 0 })), // auto-allocated
      } as any as MCPServer;
      manager.servers.set('s1', mockServer);
      manager.transports.set('s1', {} as any);

      await manager.stopServer('s1');

      expect(processManager.stopServer).toHaveBeenCalledWith(mockServer);
      expect(mockServer.markStopped).toHaveBeenCalled();
      expect(manager.transports.has('s1')).toBe(false);
      expect(portAllocator.release).toHaveBeenCalledWith(8100);
      expect(eventBus.emit).toHaveBeenCalledWith('serverStopped', 's1', 0);
    });

    it('should not release manual port', async () => {
      const mockServer = {
        id: 's1',
        isRunning: vi.fn(() => true),
        isStopped: vi.fn(() => false),
        markStopping: vi.fn(),
        markStopped: vi.fn(),
        getPort: vi.fn(() => 9000),
        getConfiguration: vi.fn(() => ({ port: 9000 })), // manual port
      } as any as MCPServer;
      manager.servers.set('s1', mockServer);
      manager.transports.set('s1', {} as any);

      await manager.stopServer('s1');

      expect(portAllocator.release).not.toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('returns false if server not running', async () => {
      const mockServer = { isRunning: vi.fn(() => false) } as any as MCPServer;
      const healthy = await manager.healthCheck('s1');
      expect(healthy).toBe(false);
    });

    it('delegates to transport and updates server health', async () => {
      const mockServer = {
        isRunning: vi.fn(() => true),
        updateHealth: vi.fn(),
        getPort: vi.fn(() => 8100),
      } as any as MCPServer;
      manager.servers.set('s1', mockServer);
      const mockTransport = {
        healthCheck: vi.fn(async () => true),
      } as any;
      manager.transports.set('s1', mockTransport);

      const healthy = await manager.healthCheck('s1');
      expect(healthy).toBe(true);
      expect(mockTransport.healthCheck).toHaveBeenCalledWith(mockServer);
      expect(mockServer.updateHealth).toHaveBeenCalledWith(true);
    });

    it('handles transport error and updates health false', async () => {
      const mockServer = {
        isRunning: vi.fn(() => true),
        updateHealth: vi.fn(),
        getPort: vi.fn(() => 8100),
        on: vi.fn(),
      } as any as MCPServer;
      manager.servers.set('s1', mockServer);
      const mockTransport = {
        healthCheck: vi.fn(async () => false),
      } as any;
      manager.transports.set('s1', mockTransport);

      const healthy = await manager.healthCheck('s1');
      expect(healthy).toBe(false);
      expect(mockServer.updateHealth).toHaveBeenCalledWith(false, expect.any(String));
    });
  });

  describe('getServerInfo', () => {
    it('returns null if server not running', async () => {
      const mockServer = { isRunning: vi.fn(() => false) } as any as MCPServer;
      const info = await manager.getServerInfo('s1');
      expect(info).toBeNull();
    });

    it('returns result tools/list via transport', async () => {
      const mockServer = {
        isRunning: vi.fn(() => true),
        getPort: vi.fn(() => 8100),
        on: vi.fn(),
      } as any as MCPServer;
      manager.servers.set('s1', mockServer);
      const mockTransport = {
        sendRequest: vi.fn(async () => ({ result: { tools: [{ name: 'test' }] } })),
      } as any;
      manager.transports.set('s1', mockTransport);

      const info = await manager.getServerInfo('s1');
      expect(info).toEqual({ tools: [{ name: 'test' }] });
      expect(mockTransport.sendRequest).toHaveBeenCalledWith(
        mockServer,
        expect.objectContaining({ method: 'tools/list', id: 2 })
      );
    });

    it('returns null if no transport', async () => {
      const mockServer = { isRunning: vi.fn(() => true), getPort: vi.fn(() => 8100) } as any as MCPServer;
      manager.servers.set('s1', mockServer);
      // no transport in map
      const info = await manager.getServerInfo('s1');
      expect(info).toBeNull();
    });
  });
});
