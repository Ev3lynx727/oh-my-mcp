import { BackendClient } from "../../domain/BackendClient.js";
import { getLogger } from "../../logger.js";

const logger = getLogger();

function interpolateEnv(value: string): string {
  return value.replace(/\{env:(\w+)\}/g, (_, varName) => process.env[varName] ?? "");
}

export interface RemoteClientConfig {
  serverId: string;
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export class RemoteClient implements BackendClient {
  readonly serverId: string;
  private url: string;
  private headers: Record<string, string>;
  private timeout: number;
  private _healthy = false;

  constructor(config: RemoteClientConfig) {
    this.serverId = config.serverId;
    this.url = config.url.replace(/\/+$/, "");
    this.headers = Object.fromEntries(
      Object.entries(config.headers ?? {}).map(([k, v]) => [k, interpolateEnv(v)])
    );
    this.timeout = config.timeout ?? 30000;
  }

  async connect(): Promise<void> {
    const healthUrl = `${this.url}/healthz`;
    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        headers: { ...this.headers, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      this._healthy = res.ok;
      if (res.ok) {
        logger.info({ serverId: this.serverId, url: this.url }, "Remote backend healthy");
      } else {
        logger.warn({ serverId: this.serverId, status: res.status }, "Remote backend health check failed");
      }
    } catch {
      this._healthy = true;
      logger.info({ serverId: this.serverId, url: this.url }, "Remote backend (no health endpoint, assuming up)");
    }
  }

  async sendRequest(request: any): Promise<any> {
    if (!this._healthy) {
      throw new Error(`Remote ${this.serverId} is not connected`);
    }

    const res = await fetch(`${this.url}/mcp`, {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
        Accept: "application/json, application/jsonl",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Remote ${this.serverId} returned ${res.status}: ${body}`);
    }

    return res.json();
  }

  isHealthy(): boolean {
    return this._healthy;
  }

  async close(): Promise<void> {
    this._healthy = false;
  }
}
