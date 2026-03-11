import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reloadServersWithStrategy, isServerRunning } from '../../../src/infrastructure/config/ReloadController';
import type { Config } from '../../../src/config';

const createMockConfig = (): Config => ({
  servers: {
    server1: { command: ['npx', 'test1'], timeout: 60000, enabled: true },
    server2: { command: ['npx', 'test2'], timeout: 60000, enabled: true },
    server3: { command: ['npx', 'test3'], timeout: 60000, enabled: true },
  },
  managementPort: 8080,
  gatewayPort: 8090,
  logLevel: 'info',
  compression: true,
} as Config);

const createMockManager = () => ({
  startServer: vi.fn().mockResolvedValue(undefined),
  stopServer: vi.fn().mockResolvedValue(undefined),
  getServer: vi.fn().mockReturnValue({ status: 'running' }),
});

describe('ReloadController', () => {
  describe('reloadServersWithStrategy', () => {
    describe('immediate strategy', () => {
      it('should start added servers immediately', async () => {
        const manager = createMockManager() as any;
        const config = createMockConfig();

        const result = await reloadServersWithStrategy(
          manager,
          config,
          ['server1'],
          [],
          [],
          { strategy: 'immediate' }
        );

        expect(result.started).toContain('server1');
        expect(result.stopped).toEqual([]);
      });

      it('should stop removed servers immediately', async () => {
        const manager = createMockManager() as any;
        const config = createMockConfig();

        const result = await reloadServersWithStrategy(
          manager,
          config,
          [],
          ['server1'],
          [],
          { strategy: 'immediate' }
        );

        expect(result.stopped).toContain('server1');
        expect(manager.stopServer).toHaveBeenCalledWith('server1');
      });

      it('should restart modified servers', async () => {
        const manager = createMockManager() as any;
        const config = createMockConfig();

        const result = await reloadServersWithStrategy(
          manager,
          config,
          [],
          [],
          ['server1'],
          { strategy: 'immediate' }
        );

        expect(result.restarted).toContain('server1');
        expect(manager.stopServer).toHaveBeenCalledWith('server1');
        expect(manager.startServer).toHaveBeenCalledWith('server1', expect.anything());
      });

      it('should track failures', async () => {
        const manager = createMockManager() as any;
        manager.startServer.mockRejectedValueOnce(new Error('Start failed'));
        const config = createMockConfig();

        const result = await reloadServersWithStrategy(
          manager,
          config,
          ['server1'],
          [],
          [],
          { strategy: 'immediate' }
        );

        expect(result.success).toBe(false);
        expect(result.failed).toContainEqual(
          expect.objectContaining({ id: 'server1', error: 'Start failed' })
        );
      });
    });

    describe('graceful strategy', () => {
      it('should use stagger delay between operations', async () => {
        const manager = createMockManager() as any;
        const config = createMockConfig();

        const start = Date.now();
        await reloadServersWithStrategy(
          manager,
          config,
          ['server1', 'server2'],
          [],
          [],
          {
            strategy: 'graceful',
            staggerDelay: 100,
            maxConcurrent: 1,
          }
        );
        const duration = Date.now() - start;

        // At least 100ms between each of 2 servers
        expect(duration).toBeGreaterThanOrEqual(100);
      }, 5000);

      it('should stop then start servers sequentially', async () => {
        const manager = createMockManager() as any;
        const config = createMockConfig();

        await reloadServersWithStrategy(
          manager,
          config,
          [],
          [],
          ['server1'],
          { strategy: 'graceful', staggerDelay: 50, maxConcurrent: 1 }
        );

        expect(manager.stopServer).toHaveBeenCalled();
        expect(manager.startServer).toHaveBeenCalled();
      });
    });

    describe('rolling strategy', () => {
      it('should respect maxConcurrent', async () => {
        const manager = createMockManager() as any;
        const config = createMockConfig();

        const start = Date.now();
        await reloadServersWithStrategy(
          manager,
          config,
          ['server1', 'server2', 'server3'],
          [],
          [],
          {
            strategy: 'rolling',
            staggerDelay: 50,
            maxConcurrent: 2,
          }
        );
        const duration = Date.now() - start;

        // With maxConcurrent=2, should be faster than sequential
        expect(duration).toBeLessThan(200);
      }, 5000);

      it('should process all servers', async () => {
        const manager = createMockManager() as any;
        const config = createMockConfig();

        const result = await reloadServersWithStrategy(
          manager,
          config,
          ['server1', 'server2'],
          ['server3'],
          [],
          { strategy: 'rolling', staggerDelay: 10, maxConcurrent: 3 }
        );

        expect(result.started).toHaveLength(2);
        expect(result.stopped).toContain('server3');
        expect(result.success).toBe(true);
      });
    });
  });

  describe('isServerRunning', () => {
    it('should return true for running server', () => {
      const manager = createMockManager() as any;

      const result = isServerRunning(manager, 'server1');

      expect(result).toBe(true);
    });

    it('should return false for undefined server', () => {
      const manager = {
        getServer: vi.fn().mockReturnValue(undefined),
      } as any;

      const result = isServerRunning(manager, 'unknown');

      expect(result).toBe(false);
    });

    it('should return false for stopped server', () => {
      const manager = {
        getServer: vi.fn().mockReturnValue({ status: 'stopped' }),
      } as any;

      const result = isServerRunning(manager, 'server1');

      expect(result).toBe(false);
    });
  });
});
