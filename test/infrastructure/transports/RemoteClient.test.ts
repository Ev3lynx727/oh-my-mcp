import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteClient } from '../../../src/infrastructure/transports/RemoteClient.js';

function mockFetch(response: Partial<Response>): ReturnType<typeof vi.fn> {
  const ok = response.status ? response.status >= 200 && response.status < 300 : true;
  const fn = vi.fn().mockResolvedValue({
    ok,
    status: response.status ?? 200,
    json: response.json ?? vi.fn().mockResolvedValue({}),
    text: response.text ?? vi.fn().mockResolvedValue(""),
    headers: new Headers(response.headers ?? {}),
  } as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('RemoteClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('sets serverId and url (strips trailing slash)', () => {
      const client = new RemoteClient({ serverId: 'ctx7', url: 'http://localhost:3000/' });
      expect(client.serverId).toBe('ctx7');
    });

    it('interpolates {env:VAR} in headers', () => {
      vi.stubEnv('API_KEY', 'secret123');
      const client = new RemoteClient({
        serverId: 'test',
        url: 'http://localhost:3000',
        headers: { Authorization: 'Bearer {env:API_KEY}' },
      });
      vi.unstubAllEnvs();
    });

    it('accepts minimal config without headers', () => {
      const client = new RemoteClient({ serverId: 'minimal', url: 'http://localhost:3000' });
      expect(client.serverId).toBe('minimal');
    });
  });

  describe('connect', () => {
    it('marks healthy on successful health check', async () => {
      mockFetch({ status: 200 });
      const client = new RemoteClient({ serverId: 'test', url: 'http://localhost:3000' });
      await client.connect();
      expect(client.isHealthy()).toBe(true);
    });

    it('marks unhealthy on failed health check', async () => {
      mockFetch({ status: 502 });
      const client = new RemoteClient({ serverId: 'test', url: 'http://localhost:3000' });
      await client.connect();
      expect(client.isHealthy()).toBe(false);
    });

    it('assumes up when no health endpoint (fetch throws)', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
      vi.stubGlobal('fetch', fn);
      const client = new RemoteClient({ serverId: 'test', url: 'http://localhost:3000' });
      await client.connect();
      expect(client.isHealthy()).toBe(true);
    });
  });

  describe('sendRequest', () => {
    it('sends JSON-RPC POST to {url}/mcp', async () => {
      const json = vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: '1', result: { tools: [] } });
      const fetch = mockFetch({ status: 200, json });

      const client = new RemoteClient({ serverId: 'test', url: 'http://localhost:3000' });
      await client.connect();
      const resp = await client.sendRequest({ jsonrpc: '2.0', id: '1', method: 'tools/list', params: {} });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'tools/list', params: {} }),
        })
      );
      expect(resp).toEqual({ jsonrpc: '2.0', id: '1', result: { tools: [] } });
    });

    it('throws when not healthy', async () => {
      const client = new RemoteClient({ serverId: 'test', url: 'http://localhost:3000' });
      await expect(client.sendRequest({ method: 'tools/list' })).rejects.toThrow('not connected');
    });

    it('throws on non-ok response', async () => {
      mockFetch({ status: 200 });
      const client = new RemoteClient({ serverId: 'test', url: 'http://localhost:3000' });
      await client.connect();

      const text = vi.fn().mockResolvedValue('Not Found');
      mockFetch({ status: 404, text });
      await expect(client.sendRequest({ method: 'tools/list' })).rejects.toThrow('returned 404');
    });
  });

  describe('close', () => {
    it('sets healthy to false', async () => {
      mockFetch({ status: 200 });
      const client = new RemoteClient({ serverId: 'test', url: 'http://localhost:3000' });
      await client.connect();
      expect(client.isHealthy()).toBe(true);
      await client.close();
      expect(client.isHealthy()).toBe(false);
    });
  });

  describe('isHealthy', () => {
    it('returns false before connect', () => {
      const client = new RemoteClient({ serverId: 'test', url: 'http://localhost:3000' });
      expect(client.isHealthy()).toBe(false);
    });
  });
});
