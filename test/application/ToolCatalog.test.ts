import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolCatalog } from '../../src/application/ToolCatalog.js';
import type { BackendClient } from '../../src/domain/BackendClient.js';

function mockBackend(id: string, tools: any[], healthy = true): BackendClient {
  return {
    serverId: id,
    sendRequest: vi.fn().mockResolvedValue({ result: { tools } }),
    isHealthy: vi.fn().mockReturnValue(healthy),
    close: vi.fn(),
  };
}

const toolA = { name: 'echo', description: 'Echo back', inputSchema: { type: 'object', properties: {} } };
const toolB = { name: 'add', description: 'Add numbers', inputSchema: { type: 'object', properties: {} } };

describe('ToolCatalog', () => {
  let catalog: ToolCatalog;

  beforeEach(() => {
    vi.useFakeTimers();
    catalog = new ToolCatalog(60_000);
  });

  afterEach(() => {
    vi.useRealTimers();
    catalog.invalidate();
  });

  it('returns namespaced tools from a single backend', async () => {
    const backends = new Map([['srv1', mockBackend('srv1', [toolA])]]);
    const tools = await catalog.getAllTools(backends);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('srv1__echo');
    expect(tools[0].description).toBe('Echo back');
  });

  it('merges tools from multiple backends', async () => {
    const backends = new Map([
      ['srv1', mockBackend('srv1', [toolA])],
      ['srv2', mockBackend('srv2', [toolB])],
    ]);
    const tools = await catalog.getAllTools(backends);

    expect(tools).toHaveLength(2);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['srv1__echo', 'srv2__add']);
  });

  it('skips unhealthy backends (degraded mode)', async () => {
    const good = mockBackend('srv1', [toolA]);
    const bad = mockBackend('srv2', [toolB], false);
    const backends = new Map([
      ['srv1', good],
      ['srv2', bad],
    ]);
    const tools = await catalog.getAllTools(backends);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('srv1__echo');
    expect(catalog.isDegraded()).toBe(true);
  });

  it('marks degraded when a backend throws', async () => {
    const good = mockBackend('srv1', [toolA]);
    const failing = mockBackend('srv2', [toolB]);
    (failing.sendRequest as any).mockRejectedValue(new Error('connection refused'));
    const backends = new Map([
      ['srv1', good],
      ['srv2', failing],
    ]);
    const tools = await catalog.getAllTools(backends);

    expect(tools).toHaveLength(1);
    expect(catalog.isDegraded()).toBe(true);
  });

  it('returns empty when all backends fail', async () => {
    const bad = mockBackend('srv1', [], false);
    const backends = new Map([['srv1', bad]]);
    const tools = await catalog.getAllTools(backends);

    expect(tools).toHaveLength(0);
    expect(catalog.isDegraded()).toBe(true);
  });

  it('uses cache within TTL', async () => {
    const backends = new Map([['srv1', mockBackend('srv1', [toolA])]]);
    await catalog.getAllTools(backends);

    // Second call uses cache — sendRequest not called again
    await catalog.getAllTools(backends);
    const client = backends.get('srv1')!;
    expect(client.sendRequest).toHaveBeenCalledTimes(1);
  });

  it('refreshes after TTL expires', async () => {
    const backends = new Map([['srv1', mockBackend('srv1', [toolA])]]);
    await catalog.getAllTools(backends);

    // Advance past TTL
    vi.advanceTimersByTime(61_000);

    await catalog.getAllTools(backends);
    const client = backends.get('srv1')!;
    expect(client.sendRequest).toHaveBeenCalledTimes(2);
  });

  it('invalidate clears cache and resets degraded', async () => {
    const backends = new Map([['srv1', mockBackend('srv1', [toolA])]]);
    await catalog.getAllTools(backends);
    expect(catalog.isDegraded()).toBe(false);

    catalog.invalidate();
    expect(catalog.getTool('srv1__echo')).toBeUndefined();
  });

  it('deduplicates concurrent refreshes', async () => {
    const backends = new Map([['srv1', mockBackend('srv1', [toolA])]]);

    // Fire two concurrent getAllTools — only one refresh should happen
    const [t1, t2] = await Promise.all([
      catalog.getAllTools(backends),
      catalog.getAllTools(backends),
    ]);

    expect(t1).toHaveLength(1);
    expect(t2).toHaveLength(1);
    expect(backends.get('srv1')!.sendRequest).toHaveBeenCalledTimes(1);
  });

  it('getTool returns the route for a known tool', async () => {
    const backends = new Map([['srv1', mockBackend('srv1', [toolA])]]);
    await catalog.getAllTools(backends);

    const route = catalog.getTool('srv1__echo');
    expect(route).toBeDefined();
    expect(route!.serverId).toBe('srv1');
    expect(route!.toolName).toBe('echo');
  });

  it('namespacing prevents name collisions', async () => {
    const backends = new Map([
      ['srv1', mockBackend('srv1', [toolA])],
      ['srv2', mockBackend('srv2', [toolA])], // same tool name
    ]);
    const tools = await catalog.getAllTools(backends);

    expect(tools).toHaveLength(2);
    expect(tools[0].name).not.toBe(tools[1].name);
  });
});
