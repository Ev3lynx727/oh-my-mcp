import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock child_process: replace spawn with a mock function
vi.mock('child_process', () => {
  const mockSpawn = vi.fn();
  return { spawn: mockSpawn };
});

import { spawn as mockSpawn } from 'child_process';
import { ProcessManager } from '../../src/application/ProcessManager.js';
import type { MCPServer } from '../../src/domain/Server.js';
import type { ServerConfig as LegacyServerConfig } from '../../src/config.js';

const mockKill = vi.fn(() => {
  mockChildProcess.killed = true;
});

const mockChildProcess = {
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() },
  on: vi.fn(),
  kill: mockKill,
  killed: false,
};

describe('ProcessManager', () => {
  let pm: ProcessManager;

  const makeLegacyConfig = (overrides: Partial<LegacyServerConfig> = {}): LegacyServerConfig => ({
    command: ['echo', 'hello'],
    env: {},
    timeout: 60000,
    enabled: true,
    ...overrides,
  });

  // Create a minimal MCPServer mock that provides id and getPort
  const makeServer = (id: string, port: number = 1234): MCPServer => ({
    id,
    getPort: () => port,
  } as unknown as MCPServer);

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReturnValue(mockChildProcess as any);
    pm = new ProcessManager();
  });

  afterEach(() => {
    pm.stopAll().catch(() => {});
  });

  it('should start a server process', async () => {
    const server = makeServer('s1', 8100);
    const config = makeLegacyConfig();
    await pm.startServer(server, config, 8100);

    expect(mockSpawn).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining([
        '-y',
        'supergateway',
        '--stdio',
        'echo hello',
        '--outputTransport',
        'streamableHttp',
        '--port',
        '8100',
      ]),
      expect.objectContaining({
        env: expect.objectContaining({}),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      })
    );
    expect(pm.isRunning('s1')).toBe(true);
    expect(pm.getProcess('s1')).toBe(mockChildProcess);
  });

  it('should stop a running server', async () => {
    const server = makeServer('s2', 8101);
    await pm.startServer(server, makeLegacyConfig(), 8101);
    expect(pm.isRunning('s2')).toBe(true);

    await pm.stopServer(server);
    expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    expect(pm.isRunning('s2')).toBe(false);
  });

  it('should stop all servers', async () => {
    const server1 = makeServer('s3a', 8102);
    const server2 = makeServer('s3b', 8103);
    await pm.startServer(server1, makeLegacyConfig(), 8102);
    await pm.startServer(server2, makeLegacyConfig(), 8103);
    expect(pm.isRunning('s3a')).toBe(true);
    expect(pm.isRunning('s3b')).toBe(true);

    await pm.stopAll();
    expect(mockChildProcess.kill).toHaveBeenCalledTimes(2);
    expect(pm.isRunning('s3a')).toBe(false);
    expect(pm.isRunning('s3b')).toBe(false);
  });

  it('should restart server', async () => {
    const server = makeServer('s4', 8104);
    await pm.startServer(server, makeLegacyConfig(), 8104);
    expect(mockSpawn).toHaveBeenCalledTimes(1);

    await pm.restartServer(server, makeLegacyConfig());
    expect(mockChildProcess.kill).toHaveBeenCalledTimes(1);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('should not start same server twice', async () => {
    const server = makeServer('s5', 8105);
    await pm.startServer(server, makeLegacyConfig(), 8105);
    await pm.startServer(server, makeLegacyConfig(), 8105);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});
