import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient } from '../../../src/infrastructure/http/HttpClient.ts';

describe('HttpClient', () => {
  let client: HttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global fetch
    global.fetch = vi.fn();
    client = new HttpClient();
  });

  it('should send JSON and return Response', async () => {
    const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ result: 'ok' }) } as any;
    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await client.post('http://localhost:1234/mcp', { jsonrpc: '2.0', id: 1 });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:1234/mcp',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1 }),
      })
    );
    expect(result).toBe(mockResponse);
  });

  it('should pass through fetch options like signal when timeout is set', async () => {
    // We'll ensure that when timeout is provided, an AbortSignal is passed.
    const mockResponse = { ok: true, json: async () => ({}) } as any;
    (global.fetch as any).mockResolvedValue(mockResponse);

    await client.post('http://localhost:1234/mcp', {}, { timeout: 5000 });

    const callArgs = (global.fetch as any).mock.calls[0][1];
    expect(callArgs.signal).toBeInstanceOf(AbortSignal);
  });
});
