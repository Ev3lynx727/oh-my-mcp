export interface MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<any>;
  text: () => Promise<string>;
}

type MockHandler = (url: string, options?: any) => Promise<MockResponse>;

let globalHandler: MockHandler | null = null;

/**
 * Set the global fetch mock handler.
 *
 * @param handler - Function that returns a mock response given URL and options.
 */
export function setMockFetch(handler: MockHandler): void {
  globalHandler = handler;
}

/**
 * Reset the global fetch mock handler.
 */
export function resetMockFetch(): void {
  globalHandler = null;
}

/**
 * Mock fetch implementation for tests.
 *
 * In test files, you can replace global.fetch with this mock.
 */
export async function mockFetch(url: string, options?: any): Promise<MockResponse> {
  if (!globalHandler) {
    return {
      ok: false,
      status: 599,
      statusText: 'Mock fetch not configured',
      json: async () => ({ error: 'No mock fetch handler set' }),
      text: async () => 'No mock fetch handler set',
    };
  }
  return globalHandler(url, options);
}

/**
 * Helper to create a MockResponse object.
 */
export function createMockResponse(data: any, status: number = 200): MockResponse {
  const ok = status >= 200 && status < 300;
  const jsonPromise = Promise.resolve(data);
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => jsonPromise,
    text: () => jsonPromise.then(JSON.stringify),
  };
}
