import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuperGatewayTransport } from '../../../src/infrastructure/transports/SuperGatewayTransport.ts';
import { HttpClient } from '../../../src/infrastructure/http/HttpClient.ts';

const mockPost = vi.fn();

const mockHttpClient: HttpClient = {
  post: mockPost,
} as any;

describe('SuperGatewayTransport', () => {
  let transport: SuperGatewayTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new SuperGatewayTransport(mockHttpClient);
  });

  // Create a server-like object with getPort and getTimeout
  const makeServer = (port: number, timeout: number = 60000) => ({
    getPort: () => port,
    getTimeout: () => timeout,
    id: 'test',
  } as any);

  it('getEndpoint returns URL with port', () => {
    const url = transport.getEndpoint(makeServer(8100));
    expect(url).toBe('http://127.0.0.1:8100/mcp');
  });

  it('usesPort returns true', () => {
    expect(transport.usesPort()).toBe(true);
  });

  it('isReady polls until initialize succeeds (200 or 400)', async () => {
    // First call throws, second succeeds with 400
    mockPost.mockRejectedValueOnce(new Error('conn refused'));
    mockPost.mockResolvedValueOnce({ ok: true, status: 400, json: async () => ({}) });

    const ready = await transport.isReady(makeServer(1234), 5000);
    expect(ready).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('isReady returns false after timeout without success', async () => {
    mockPost.mockRejectedValue(new Error('down'));
    const ready = await transport.isReady(makeServer(1234), 100);
    expect(ready).toBe(false);
  });

  it('healthCheck returns true for 200', async () => {
    mockPost.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const healthy = await transport.healthCheck(makeServer(1234));
    expect(healthy).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/mcp',
      expect.objectContaining({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
      { timeout: 60000 }
    );
  });

  it('healthCheck returns true for 400 (some servers respond 400 for unsupported method but still valid)', async () => {
    mockPost.mockResolvedValue({ ok: true, status: 400, json: async () => ({}) });
    const healthy = await transport.healthCheck(makeServer(1234));
    expect(healthy).toBe(true);
  });

  it('healthCheck returns false on non-ok response', async () => {
    mockPost.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const healthy = await transport.healthCheck(makeServer(1234));
    expect(healthy).toBe(false);
  });

  it('healthCheck returns false if server has no port', async () => {
    const badServer = { getPort: () => 0, getTimeout: () => 60000, id: 'test' } as any;
    // Synchronous check in transport: returns false without calling HttpClient
    // Actually isReady checks port; healthCheck also checks port; it will return false immediately.
    const healthy = await transport.healthCheck(badServer);
    expect(healthy).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('sendRequest returns parsed JSON on ok', async () => {
    const responseData = { jsonrpc: '2.0', result: {} };
    mockPost.mockResolvedValue({ ok: true, status: 200, text: async () => `event: message\\ndata: ${JSON.stringify(responseData)}\\n\\n` });
    const server = makeServer(1234);
    const req = { jsonrpc: '2.0', id: 1, method: 'test', params: {} };
    const result = await transport.sendRequest(server, req);
    expect(result).toEqual(responseData);
    expect(mockPost).toHaveBeenCalledWith('http://127.0.0.1:1234/mcp', req, { timeout: 60000 });
  });

  it('sendRequest throws on non-ok with JSON body', async () => {
    mockPost.mockResolvedValue({ ok: false, status: 502, text: async () => '{"error":"bad"}', json: async () => ({ error: 'bad' }) });
    const server = makeServer(1234);
    const req = { jsonrpc: '2.0', id: 1, method: 'test', params: {} };
    await expect(transport.sendRequest(server, req)).rejects.toThrow('HTTP 502: {"error":"bad"}');
  });

  it('sendRequest throws if server has no port', async () => {
    const badServer = { getPort: () => 0, getTimeout: () => 60000, id: 'test' } as any;
    await expect(transport.sendRequest(badServer, {})).rejects.toThrow('Server test has no port assigned');
  });
});
