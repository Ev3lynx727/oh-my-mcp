import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolCatalog } from '../../src/application/ToolCatalog.js';
import { SessionManager } from '../../src/application/SessionManager.js';
import type { BackendClient } from '../../src/domain/BackendClient.js';

function mockBackend(id: string, tools: any[]): BackendClient {
  return {
    serverId: id,
    sendRequest: vi.fn().mockResolvedValue({ result: { tools } }),
    isHealthy: vi.fn().mockReturnValue(true),
    close: vi.fn(),
  };
}

const echoTool = {
  name: 'echo',
  description: 'Echo back input',
  inputSchema: { type: 'object' as const, properties: { msg: { type: 'string' } } },
};

const addTool = {
  name: 'add',
  description: 'Add two numbers',
  inputSchema: { type: 'object' as const, properties: { a: { type: 'number' }, b: { type: 'number' } } },
};

describe('McpHost flow (ToolCatalog + SessionManager)', () => {
  let catalog: ToolCatalog;
  let sessionManager: SessionManager;
  let backends: Map<string, BackendClient>;

  beforeEach(() => {
    vi.useFakeTimers();
    catalog = new ToolCatalog(60_000);
    sessionManager = new SessionManager(300_000);
    backends = new Map([
      ['ark-exec', mockBackend('ark-exec', [echoTool])],
      ['ark-memory', mockBackend('ark-memory', [addTool])],
    ]);
  });

  afterEach(() => {
    sessionManager.destroy();
    catalog.invalidate();
    vi.useRealTimers();
  });

  it('simulate: initialize → tools/list → tools/call flow', async () => {
    // Step 1: Client sends initialize → host creates session
    const sessionId = `sess-${Date.now()}`;
    sessionManager.createSession(sessionId, backends);
    const session = sessionManager.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session!.backends.size).toBe(2);

    // Step 2: Client sends tools/list → catalog aggregates
    const tools = await catalog.getAllTools(backends);
    expect(tools).toHaveLength(2);
    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual(['ark-exec__echo', 'ark-memory__add']);

    // Step 3: Client sends tools/call ark-exec__echo → route to ark-exec
    const route = catalog.getTool('ark-exec__echo');
    expect(route).toBeDefined();
    expect(route!.serverId).toBe('ark-exec');

    const response = await route!.backendClient.sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'echo', arguments: { msg: 'hello' } },
    });
    expect(response.result).toBeDefined();
  });

  it('tools/call returns 404 for unknown tool', async () => {
    await catalog.getAllTools(backends);
    const route = catalog.getTool('nonexistent__tool');
    expect(route).toBeUndefined();
  });

  it('session expires and tools still work for new sessions', async () => {
    const sid = 'sess-1';
    sessionManager.createSession(sid, backends, 1000);

    // Session alive
    expect(sessionManager.getSession(sid)).toBeDefined();

    // Expire it
    vi.advanceTimersByTime(1500);
    expect(sessionManager.getSession(sid)).toBeUndefined();

    // Catalog still works — independent of sessions
    const tools = await catalog.getAllTools(backends);
    expect(tools).toHaveLength(2);

    // New session can be created
    sessionManager.createSession('sess-2', backends);
    expect(sessionManager.getSession('sess-2')).toBeDefined();
  });

  it('degraded catalog when one backend is down', async () => {
    const healthy = mockBackend('ark-exec', [echoTool]);
    const dead = mockBackend('ark-memory', [addTool]);
    (dead.isHealthy as any).mockReturnValue(false);

    const degradedBackends = new Map([
      ['ark-exec', healthy],
      ['ark-memory', dead],
    ]);

    const tools = await catalog.getAllTools(degradedBackends);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('ark-exec__echo');
    expect(catalog.isDegraded()).toBe(true);
  });

  it('catalog invalidation forces fresh fetch', async () => {
    await catalog.getAllTools(backends);
    const client = backends.get('ark-exec')!;
    expect(client.sendRequest).toHaveBeenCalledTimes(1);

    catalog.invalidate();
    await catalog.getAllTools(backends);
    expect(client.sendRequest).toHaveBeenCalledTimes(2);
  });
});
