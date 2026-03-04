import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adaptLegacyConfig, adaptToLegacyState } from '../../src/application/adapters.js';
import { MCPServer } from '../../src/domain/Server.js';
import type { ServerConfig as LegacyServerConfig } from '../../src/config.js';

describe('adapters', () => {
  describe('adaptLegacyConfig', () => {
    it('converts legacy config to domain config with defaults', () => {
      const legacy: LegacyServerConfig = {
        command: ['node', 'server.js'],
        env: { KEY: 'val' },
        timeout: 12345,
        port: 9000,
        enabled: true,
      };
      const domain = adaptLegacyConfig(legacy, 'myid');
      expect(domain).toEqual({
        id: 'myid',
        name: 'myid',
        command: ['node', 'server.js'],
        env: { KEY: 'val' },
        timeout: 12345,
        port: 9000,
        enabled: true,
        transport: 'supergateway', // default
        healthCheck: undefined,
      });
    });

    it('respects transport from legacy config', () => {
      const legacy: LegacyServerConfig = {
        command: ['node', 'server.js'],
        env: {},
        timeout: 60000,
        port: 0,
        enabled: true,
        transport: 'stdio',
      };
      const domain = adaptLegacyConfig(legacy, 'id');
      expect(domain.transport).toBe('stdio');
    });

    it('respects healthCheck from legacy config', () => {
      const legacy: LegacyServerConfig = {
        command: ['node', 'server.js'],
        timeout: 60000,
        port: 0,
        enabled: true,
        healthCheck: { interval: 10000, timeout: 2000, unhealthyThreshold: 5 },
      };
      const domain = adaptLegacyConfig(legacy, 'id');
      expect(domain.healthCheck).toEqual({ interval: 10000, timeout: 2000, unhealthyThreshold: 5 });
    });
  });

  describe('adaptToLegacyState', () => {
    it('converts domain server to legacy state', () => {
      const server = MCPServer.fromRawConfig({
        id: 's',
        name: 'S',
        command: ['cmd'],
        env: {},
        timeout: 60000,
        port: 0,
        enabled: true,
        transport: 'supergateway',
        healthCheck: { interval: 10000 },
      });
      server.markStarting();
      server.setAllocatedPort(1234);
      server.markRunning(1234, { kill: vi.fn() } as any);
      server.updateHealth(true);

      const state = adaptToLegacyState(server);
      expect(state.id).toBe('s');
      expect(state.status).toBe('running');
      expect(state.port).toBe(1234);
      expect(state.config.transport).toBe('supergateway');
      expect(state.config.healthCheck).toEqual({ interval: 10000 });
      expect(state.health).toBe(true);
    });

    it('includes error in state when server is in error', () => {
      const server = MCPServer.fromRawConfig({
        id: 'err',
        name: 'Err',
        command: ['fail'],
        env: {},
        timeout: 60000,
        enabled: true,
      });
      server.markError('boom');
      const state = adaptToLegacyState(server);
      expect(state.status).toBe('error');
      expect(state.error).toBe('boom');
    });
  });
});
