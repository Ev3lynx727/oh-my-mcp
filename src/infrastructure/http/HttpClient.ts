/**
 * HTTP Client wrapper with retry, timeout, and structured errors.
 *
 * Used by HealthChecker and other services that need reliable HTTP calls.
 */

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: any
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = "TimeoutError";
  }
}

export interface HttpClientOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts (default 0) */
  retries?: number;
  /** Backoff factor between retries (default 0.1) */
  backoffFactor?: number;
  /** Maximum wait between retries (ms, default 1000) */
  maxBackoffMs?: number;
  /** Base URL to prepend to relative paths */
  baseUrl?: string;
}

/**
 * Simple HTTP client built on top of fetch.
 *
 * Features:
 * - Timeout enforcement (via AbortController)
 * - Retry with exponential backoff
 * - Structured errors (HttpError, TimeoutError)
 * - Debug logging
 */
export class HttpClient {
  private defaultTimeout: number;
  private defaultRetries: number;
  private backoffFactor: number;
  private maxBackoffMs: number;
  private baseUrl?: string;
  private logger?: any;

  constructor(options: HttpClientOptions = {}) {
    this.defaultTimeout = options.timeout ?? 5000;
    this.defaultRetries = options.retries ?? 0;
    this.backoffFactor = options.backoffFactor ?? 0.1;
    this.maxBackoffMs = options.maxBackoffMs ?? 1000;
    this.baseUrl = options.baseUrl;
    this.logger = undefined; // Could inject, but will use console for now
  }

  /**
   * Perform a GET request.
   */
  async get(url: string, options: HttpClientOptions = {}): Promise<Response> {
    return this.request("GET", url, undefined, options);
  }

  /**
   * Perform a POST request with JSON body.
   */
  async post(url: string, body: any, options: HttpClientOptions = {}): Promise<Response> {
    return this.request("POST", url, body, options);
  }

  /**
   * Perform an HTTP request with retry and timeout.
   */
  private async request(
    method: string,
    url: string,
    body: any,
    options: HttpClientOptions
  ): Promise<Response> {
    const fullUrl = this.baseUrl ? `${this.baseUrl}${url}` : url;
    const timeout = options.timeout ?? this.defaultTimeout;
    const retries = options.retries ?? this.defaultRetries;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(fullUrl, {
          method,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errBody = await response.text().catch(() => undefined);
          throw new HttpError(`HTTP ${response.status}`, response.status, errBody);
        }

        return response;
      } catch (error: any) {
        clearTimeout(timeoutId);

        // AbortError indicates timeout
        if (error.name === "AbortError") {
          lastError = new TimeoutError(`Request timeout after ${timeout}ms`, timeout);
        } else {
          lastError = error;
        }

        // If this was the last attempt, throw
        if (attempt >= retries) {
          break;
        }

        // Calculate backoff delay
        const delay = Math.min(this.backoffFactor * Math.pow(2, attempt) * 1000, this.maxBackoffMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
