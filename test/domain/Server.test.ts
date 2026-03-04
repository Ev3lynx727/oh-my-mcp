import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPServer } from '../../src/domain/Server.js';
import { ServerStatus } from '../../src/domain/ServerStatus.js';
import type { ServerConfig as DomainServerConfig } from '../../src/domain/ServerStatus.js';

function makeConfig(overrides: Partial<DomainServerConfig> = {}): DomainServerConfig {
  return {
    id: 'test',
    name: 'Test Server',
    command: ['echo', 'test'],
    env: {},
    timeout: 60000,
    port: 0,
    enabled: true,
    transport: 'supergateway',
    ...overrides,
  };
}

describe('MCPServer', () => {
  it('should create with initial STOPPED state', () => {
    const server = MCPServer.fromRawConfig(makeConfig());
    expect(server.isStopped()).toBe(true);
    expect(server.isRunning()).toBe(false);
    expect(server.getPort()).toBe(0);
    expect(server.getError()).toBeNull();
  });

  it('should transition STOPPED -> STARTING', () => {
    const server = MCPServer.fromRawConfig(makeConfig());
    server.markStarting();
    expect(server.getStatus()).toBe(ServerStatus.STARTING);
    expect(server.isStopped()).toBe(false);
  });

  it('should transition STARTING -> RUNNING', () => {
    const server = MCPServer.fromRawConfig(makeConfig());
    server.markStarting();
    const fakeChild = { kill: vi.fn() as any };
    server.markRunning(8100, fakeChild);
    expect(server.getStatus()).toBe(ServerStatus.RUNNING);
    expect(server.getPort()).toBe(8100);
    expect(server.getProcess()).toBe(fakeChild);
  });

  it('should transition RUNNING -> STOPPING -> STOPPED', () => {
    const server = MCPServer.fromRawConfig(makeConfig());
    server.markStarting();
    server.markRunning(8100, { kill: vi.fn() } as any);
    server.markStopping();
    expect(server.getStatus()).toBe(ServerStatus.STOPPING);
    server.markStopped();
    expect(server.getStatus()).toBe(ServerStatus.STOPPED);
    expect(server.getPort()).toBe(0);
    expect(server.getProcess()).toBeNull();
  });

  it('should transition to ERROR on failure', () => {
    const server = MCPServer.fromRawConfig(makeConfig());
    const err = new Error('fail');
    server.markError(err.message);
    expect(server.getStatus()).toBe(ServerStatus.ERROR);
    expect(server.getError()).toBe(err.message);
  });

  it('should not start if not STOPPED', () => {
    const server = MCPServer.fromRawConfig(makeConfig());
    server.markStarting();
    expect(() => server.markStarting()).toThrow('Cannot mark server test as STARTING from status STARTING');
  });

  it('should update health', () => {
    const server = MCPServer.fromRawConfig(makeConfig());
    server.updateHealth(true);
    expect(server.getHealth()).toBe(true);
    server.updateHealth(false, 'timed out');
    expect(server.getHealth()).toBe(false);
    expect(server.getError()).toContain('timed out');
  });

  it('should emit events on state changes', () => {
    const server = MCPServer.fromRawConfig(makeConfig());
    const handler = vi.fn();
    server.on('statusChange', handler);
    server.markStarting();
    expect(handler).toHaveBeenCalledWith(ServerStatus.STARTING);
  });
});
