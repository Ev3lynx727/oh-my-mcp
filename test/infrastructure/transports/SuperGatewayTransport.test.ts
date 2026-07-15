import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuperGatewayTransport } from '../../../src/infrastructure/transports/SuperGatewayTransport.ts';
import { HttpClient } from '../../../src/infrastructure/http/HttpClient.ts';

const mockPost = vi.fn();
const mockGet = vi.fn();

const mockHttpClient: HttpClient = {
  post: mockPost,
  get: mockGet,
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

  it('canProxy returns false (supergateway handled by MCP Host, not 8090 gateway)', () => {
    expect(transport.canProxy()).toBe(false);
  });

  it('isReady polls until get succeeds', async () => {
    // First call throws, second succeeds
    mockGet.mockRejectedValueOnce(new Error('conn refused'));
    mockGet.mockResolvedValueOnce({ ok: true, status: 200 } as any);

    const ready = await transport.isReady(makeServer(1234), 5000);
    expect(ready).toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('isReady returns false after timeout without success', async () => {
    mockGet.mockRejectedValue(new Error('down'));
    const ready = await transport.isReady(makeServer(1234), 100);
    expect(ready).toBe(false);
  });

  it('healthCheck returns true for 200', async () => {
    mockGet.mockResolvedValue({ ok: true, status: 200 } as any);
    const healthy = await transport.healthCheck(makeServer(1234));
    expect(healthy).toBe(true);
    expect(mockGet).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/healthz',
      { timeout: 5000 }
    );
  });

  it('healthCheck returns true for 400', async () => {
    mockGet.mockResolvedValue({ ok: true, status: 400 } as any);
    const healthy = await transport.healthCheck(makeServer(1234));
    expect(healthy).toBe(true);
  });

  it('healthCheck returns false on non-ok response', async () => {
    mockGet.mockResolvedValue({ ok: false, status: 500 } as any);
    const healthy = await transport.healthCheck(makeServer(1234));
    expect(healthy).toBe(false);
  });

  it('healthCheck returns false if server has no port', async () => {
    const badServer = { getPort: () => 0, getTimeout: () => 60000, id: 'test' } as any;
    const healthy = await transport.healthCheck(badServer);
    expect(healthy).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('sendRequest returns parsed JSON on ok', async () => {
    const responseData = { jsonrpc: '2.0', result: {} };
    mockPost.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(responseData), headers: { get: () => null } });
    const server = makeServer(1234);
    const req = { jsonrpc: '2.0', id: 1, method: 'test', params: {} };
    const result = await transport.sendRequest(server, req);
    expect(result).toEqual(responseData);
    expect(mockPost).toHaveBeenCalledWith('http://127.0.0.1:1234/mcp', req, { timeout: 15000, headers: { Accept: "application/json, text/event-stream" } });
  });

  it('sendRequest captures and sends session ID header', async () => {
    // First request — no session ID yet, response gives one
    const initResponse = { jsonrpc: '2.0', result: { protocolVersion: '2024-11-05' } };
    mockPost.mockResolvedValueOnce({
      ok: true, status: 200, text: async () => JSON.stringify(initResponse),
      headers: { get: (h: string) => h === 'mcp-session-id' ? 'abc-123' : null }
    });
    // Second request — should include session ID
    const toolResponse = { jsonrpc: '2.0', result: { tools: [] } };
    mockPost.mockResolvedValueOnce({
      ok: true, status: 200, text: async () => JSON.stringify(toolResponse),
      headers: { get: () => null }
    });

    const server = makeServer(1234);
    await transport.sendRequest(server, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    await transport.sendRequest(server, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

    // First call: Accept header, no session id yet
    expect(mockPost.mock.calls[0][2].headers).toEqual({ Accept: "application/json, text/event-stream" });
    // Second call: includes captured session ID (and Accept)
    expect(mockPost.mock.calls[1][2].headers).toEqual({ Accept: "application/json, text/event-stream", 'mcp-session-id': 'abc-123' });
  });

  it('sendRequest parses SSE-framed responses (event: message\\ndata: ...)', async () => {
    const payload = { jsonrpc: '2.0', result: { protocolVersion: '2024-11-05' } };
    const sseBody = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
    mockPost.mockResolvedValue({ ok: true, status: 200, text: async () => sseBody, headers: { get: () => null } });
    const server = makeServer(1234);
    const req = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
    const result = await transport.sendRequest(server, req);
    expect(result).toEqual(payload);
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
