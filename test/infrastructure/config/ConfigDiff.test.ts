import { describe, it, expect } from 'vitest';
import { diffConfigs, diffServerConfigs, shouldRestartServer } from '../../../src/infrastructure/config/ConfigDiff';
import type { Config } from '../../../src/config';

const createMockConfig = (servers: Record<string, any>): Config => ({
  servers,
  managementPort: 8080,
  gatewayPort: 8090,
  logLevel: 'info',
  compression: true,
} as Config);

describe('ConfigDiff', () => {
  describe('diffConfigs', () => {
    it('should detect added servers', () => {
      const oldConfig = createMockConfig({ server1: { command: ['npx', 'test'] } });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'test'] },
        server2: { command: ['npx', 'test2'] },
      });

      const diff = diffConfigs(oldConfig, newConfig);

      expect(diff.added).toContain('server2');
      expect(diff.removed).toEqual([]);
      expect(diff.modified).toEqual([]);
    });

    it('should detect removed servers', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'test'] },
        server2: { command: ['npx', 'test2'] },
      });
      const newConfig = createMockConfig({ server1: { command: ['npx', 'test'] } });

      const diff = diffConfigs(oldConfig, newConfig);

      expect(diff.removed).toContain('server2');
      expect(diff.added).toEqual([]);
    });

    it('should detect modified servers', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'test'], timeout: 30000 },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'test'], timeout: 60000 },
      });

      const diff = diffConfigs(oldConfig, newConfig);

      expect(diff.modified).toContain('server1');
    });

    it('should detect unchanged servers', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'test'], timeout: 30000 },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'test'], timeout: 30000 },
      });

      const diff = diffConfigs(oldConfig, newConfig);

      expect(diff.unchanged).toContain('server1');
      expect(diff.modified).toEqual([]);
    });
  });

  describe('diffServerConfigs', () => {
    it('should provide details of what changed', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'test'], env: { KEY: 'old' }, timeout: 30000 },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'test'], env: { KEY: 'new' }, timeout: 60000 },
      });

      const diff = diffServerConfigs(oldConfig, newConfig);

      expect(diff.details.server1).toBeDefined();
      expect(diff.details.server1?.env).toBe(true);
      expect(diff.details.server1?.timeout).toBe(true);
    });

    it('should detect command change', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'old'] },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'new'] },
      });

      const diff = diffServerConfigs(oldConfig, newConfig);

      expect(diff.details.server1?.command).toBe(true);
    });

    it('should detect port change', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'test'], port: 8100 },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'test'], port: 8200 },
      });

      const diff = diffServerConfigs(oldConfig, newConfig);

      expect(diff.details.server1?.port).toBe(true);
    });

    it('should detect transport change', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'test'], transport: 'supergateway' as const },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'test'], transport: 'stdio' as const },
      });

      const diff = diffServerConfigs(oldConfig, newConfig);

      expect(diff.details.server1?.transport).toBe(true);
    });
  });

  describe('shouldRestartServer', () => {
    it('should return true for command change', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'old'] },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'new'] },
      });

      const diff = diffServerConfigs(oldConfig, newConfig);
      const result = shouldRestartServer(diff, 'server1');

      expect(result).toBe(true);
    });

    it('should return true for env change', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'test'], env: { KEY: 'old' } },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'test'], env: { KEY: 'new' } },
      });

      const diff = diffServerConfigs(oldConfig, newConfig);
      const result = shouldRestartServer(diff, 'server1');

      expect(result).toBe(true);
    });

    it('should return false for timeout change only', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'test'], timeout: 30000 },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'test'], timeout: 60000 },
      });

      const diff = diffServerConfigs(oldConfig, newConfig);
      const result = shouldRestartServer(diff, 'server1');

      expect(result).toBe(false);
    });

    it('should return false for enabled change only', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'test'], enabled: true },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'test'], enabled: false },
      });

      const diff = diffServerConfigs(oldConfig, newConfig);
      const result = shouldRestartServer(diff, 'server1');

      expect(result).toBe(false);
    });

    it('should return false for healthCheck change only', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'test'], healthCheck: { interval: 30000 } },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'test'], healthCheck: { interval: 60000 } },
      });

      const diff = diffServerConfigs(oldConfig, newConfig);
      const result = shouldRestartServer(diff, 'server1');

      expect(result).toBe(false);
    });

    it('should return true for port change', () => {
      const oldConfig = createMockConfig({
        server1: { command: ['npx', 'test'], port: 8100 },
      });
      const newConfig = createMockConfig({
        server1: { command: ['npx', 'test'], port: 8200 },
      });

      const diff = diffServerConfigs(oldConfig, newConfig);
      const result = shouldRestartServer(diff, 'server1');

      expect(result).toBe(true);
    });

    it('should return false for unknown server', () => {
      const diff = diffServerConfigs(
        createMockConfig({}),
        createMockConfig({})
      );
      const result = shouldRestartServer(diff, 'unknown');

      expect(result).toBe(false);
    });
  });
});
