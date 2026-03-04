import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Helper: wait for a URL to return status 200 and optionally satisfy condition
async function waitForURL(
  url: string,
  timeoutMs: number = 30000,
  condition?: (json: any) => boolean
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (!condition || condition(json)) {
          return;
        }
      }
    } catch {
      // ignore errors and retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

describe('Real Gateway Integration', () => {
  let mainProcess: ChildProcess;
  const managementPort = 18080;
  const gatewayPort = 18090;
  let configDir: string;

  beforeAll(async () => {
    // Create temporary config directory and file
    configDir = join(tmpdir(), 'oh-my-mcp-integration');
    await mkdir(configDir, { recursive: true });
    const configPath = join(configDir, 'config.yaml');

    const configContent = `
managementPort: ${managementPort}
gatewayPort: ${gatewayPort}
logLevel: debug
servers:
  everything:
    command: ["npx", "-y", "@modelcontextprotocol/server-everything"]
    transport: "supergateway"
    timeout: 60000
    enabled: true
`;
    await writeFile(configPath, configContent);

    // Spawn the main process using compiled dist
    mainProcess = spawn('node', ['dist/index.js'], {
      cwd: configDir,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' },
    });

    // Wait for the health endpoint to be ready
    await waitForURL(`http://localhost:${managementPort}/health`, 120000);
  });

  afterAll(() => {
    // Stop the main process
    if (mainProcess && !mainProcess.killed) {
      mainProcess.kill('SIGTERM');
      // Give it a moment to exit
      setTimeout(() => {
        if (!mainProcess.killed) {
          mainProcess.kill('SIGKILL');
        }
      }, 2000);
    }

    // Cleanup config directory
    rm(configDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should report health with servers count', async () => {
    const res = await fetch(`http://localhost:${managementPort}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: 'ok', servers: 1 });
  });

  it('should list servers via management API, everything running', async () => {
    const res = await fetch(`http://localhost:${managementPort}/servers`);
    expect(res.status).toBe(200);
    const { servers } = await res.json();
    expect(Array.isArray(servers)).toBe(true);
    const everything = servers.find((s: any) => s.id === 'everything');
    expect(everything).toBeDefined();
    expect(everything.status).toBe('running');
    expect(everything.port).toBeGreaterThan(0);
  });

  it('should proxy tools/list request through gateway', async () => {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    };
    const res = await fetch(`http://localhost:${gatewayPort}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(1);
    expect(data).toHaveProperty('result');
    expect(data.result).toHaveProperty('tools');
    expect(Array.isArray(data.result.tools)).toBe(true);
  });

  it('should handle initialize via gateway', async () => {
    const body = {
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    };
    const res = await fetch(`http://localhost:${gatewayPort}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // initialize may return 200 or 400 (depending on server), both acceptable
    expect(res.ok || res.status === 400).toBe(true);
    const data = await res.json();
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(2);
    expect(data).toHaveProperty('result');
  });

  it('should stop and start server via management API', async () => {
    // Stop the server
    let res = await fetch(`http://localhost:${managementPort}/servers/everything/stop`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);

    // Wait until status becomes stopped
    await waitForURL(
      `http://localhost:${managementPort}/servers/everything`,
      10000,
      (s) => s.status === 'stopped'
    );

    // Start the server
    res = await fetch(`http://localhost:${managementPort}/servers/everything/start`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);

    // Wait until status becomes running again
    await waitForURL(
      `http://localhost:${managementPort}/servers/everything`,
      10000,
      (s) => s.status === 'running'
    );
  });
});
