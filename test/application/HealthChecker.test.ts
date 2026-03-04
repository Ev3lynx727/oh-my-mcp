import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthChecker } from '../../src/application/HealthChecker.js';

// Mock HttpClient
const mockHttpClient = {
  post: vi.fn(),
};

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    vi.clearAllMocks();
    checker = new HealthChecker(mockHttpClient as any);
  });

  it('should return true on successful tools/list response with 200', async () => {
    mockHttpClient.post.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ result: {} }),
    } as any);

    const server = {
      getPort: () => 1234,
      getTimeout: () => 5000,
    } as any;

    const result = await checker.check(server);
    expect(result).toBe(true);
    expect(mockHttpClient.post).toHaveBeenCalledWith(
      'http://localhost:1234/mcp',
      expect.objectContaining({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
      { timeout: 5000 }
    );
  });

  it('should return true on response status 400 (some servers return 400 for unsupported methods but still valid)', async () => {
    mockHttpClient.post.mockResolvedValue({
      ok: true,
      status: 400,
      json: vi.fn().mockResolvedValue({}),
    } as any);

    const server = {
      getPort: () => 1234,
      getTimeout: () => 5000,
    } as any;

    const result = await checker.check(server);
    expect(result).toBe(true);
  });

  it('should return false on non-ok response', async () => {
    mockHttpClient.post.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({}),
    } as any);

    const server = {
      getPort: () => 1234,
      getTimeout: () => 5000,
    } as any;

    const result = await checker.check(server);
    expect(result).toBe(false);
  });

  it('should return false on network error', async () => {
    mockHttpClient.post.mockRejectedValue(new Error('Connection refused'));

    const server = {
      getPort: () => 1234,
      getTimeout: () => 5000,
    } as any;

    const result = await checker.check(server);
    expect(result).toBe(false);
  });

  it('should return false if server has no port', async () => {
    const server = {
      getPort: () => 0,
      getTimeout: () => 5000,
    } as any;

    const result = await checker.check(server);
    expect(result).toBe(false);
    expect(mockHttpClient.post).not.toHaveBeenCalled();
  });
});
