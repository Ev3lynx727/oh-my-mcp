import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { mkdir, writeFile, rm, copyFile } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const INTEGRATION_TIMEOUT = 150000;

async function waitForURL(url: string, timeoutMs = 30000, condition?: (json: any) => boolean): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        if (!condition || condition(await res.json())) return;
      }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

describe('Stdio Gateway Integration', { timeout: INTEGRATION_TIMEOUT }, () => {
  let mainProcess: ChildProcess;
  const managementPort = 28081;
  const gatewayPort = 28091;
  let configDir: string;

  beforeAll(async () => {
    configDir = join(tmpdir(), 'oh-my-mcp-stdio-integration');
    await mkdir(configDir, { recursive: true });

    const echoServerPath = join(configDir, 'echo-mcp-server.mjs');
    const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'echo-mcp-server.mjs');
    await copyFile(sourcePath, echoServerPath);

    const configContent = `managementPort: ${managementPort}
gatewayPort: ${gatewayPort}
logLevel: debug
servers:
  echo:
    command: ["node", "${echoServerPath}"]
    transport: stdio
    timeout: 30000
    enabled: true
`;
    await writeFile(join(configDir, 'config.yaml'), configContent);

    mainProcess = spawn('node', ['dist/index.js', join(configDir, 'config.yaml')], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' },
    });

    await waitForURL(`http://localhost:${managementPort}/servers`, 30000,
      (json) => json.servers?.some((s: any) => s.id === 'echo' && s.status === 'running'));
  });

  afterAll(() => {
    if (mainProcess && !mainProcess.killed) {
      mainProcess.kill('SIGTERM');
      setTimeout(() => { if (!mainProcess.killed) mainProcess.kill('SIGKILL'); }, 2000);
    }
    rm(configDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should list echo server via management API', async () => {
    const res = await fetch(`http://localhost:${managementPort}/servers`);
    expect(res.status).toBe(200);
    const { servers } = await res.json();
    const echo = servers.find((s: any) => s.id === 'echo');
    expect(echo).toBeDefined();
    expect(echo.status).toBe('running');
  });

  it('should proxy tools/list through gateway to stdio server', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
    const res = await fetch(`http://localhost:${gatewayPort}/mcp/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(1);
    expect(data.result).toBeDefined();
    expect(data.result.tools).toBeDefined();
    expect(data.result.tools[0].name).toBe('echo');
  });

  it('should proxy custom method through gateway to stdio server', async () => {
    const body = { jsonrpc: '2.0', id: 2, method: 'custom/method', params: { foo: 'bar' } };
    const res = await fetch(`http://localhost:${gatewayPort}/mcp/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(2);
    expect(data.result.method).toBe('custom/method');
    expect(data.result.echo.foo).toBe('bar');
  });

  it('should report 503 for stopped server', async () => {
    await fetch(`http://localhost:${managementPort}/servers/echo/stop`, { method: 'POST' });
    await waitForURL(`http://localhost:${managementPort}/servers/echo`, 10000,
      (s: any) => s.status === 'stopped');

    const body = { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} };
    const res = await fetch(`http://localhost:${gatewayPort}/mcp/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(503);

    await fetch(`http://localhost:${managementPort}/servers/echo/start`, { method: 'POST' });
    await waitForURL(`http://localhost:${managementPort}/servers/echo`, 10000,
      (s: any) => s.status === 'running');
  });

  it('should expose Prometheus metrics', async () => {
    const res = await fetch(`http://localhost:${managementPort}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    const text = await res.text();
    expect(text).toContain('ohmy_mcp_servers_total');
    expect(text).toContain('ohmy_mcp_requests_total');
  });
});
