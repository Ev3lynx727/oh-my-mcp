import { collectDefaultMetrics, Registry, Counter, Gauge, Histogram } from 'prom-client';

/**
 * Application metrics collector.
 *
 * Exposes Prometheus metrics at /metrics endpoint.
 * Includes:
 * - Process metrics (memory, CPU) via collectDefaultMetrics
 * - Custom counters, gauges, histograms for MCP server operations
 */
export class AppMetrics {
  public readonly registry: Registry;

  // Custom metrics
  public readonly serverCount: Gauge<string>;
  public readonly requestsTotal: Counter<string>;
  public readonly requestDuration: Histogram<string>;
  public readonly errorsTotal: Counter<string>;

  private initialized = false;

  constructor() {
    this.registry = new Registry();

    // Register default Node.js process metrics
    collectDefaultMetrics({ register: this.registry });

    // Define custom metrics
    this.serverCount = new Gauge({
      name: 'ohmy_mcp_servers_total',
      help: 'Number of MCP servers by status',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.requestsTotal = new Counter({
      name: 'ohmy_mcp_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.requestDuration = new Histogram({
      name: 'ohmy_mcp_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.errorsTotal = new Counter({
      name: 'ohmy_mcp_errors_total',
      help: 'Total number of unhandled errors',
      labelNames: ['type', 'context'],
      registers: [this.registry],
    });

    this.initialized = true;
  }

  /**
   * Increment request counter.
   */
  recordRequest(method: string, route: string, statusCode: number): void {
    this.requestsTotal.inc({ method, route, status_code: String(statusCode) });
  }

  /**
   * Observe request duration (seconds).
   */
  observeDuration(method: string, route: string, seconds: number): void {
    this.requestDuration.observe({ method, route }, seconds);
  }

  /**
   * Increment error counter.
   */
  recordError(type: string, context?: string): void {
    this.errorsTotal.inc({ type, context: context || 'unknown' });
  }

  /**
   * Update server count gauges based on current servers map.
   *
   * @param servers - Array of server status objects (like ServerState)
   */
  updateServerCounts(servers: Array<{ status: string }>): void {
    // Reset all gauges first
    const labels = ['running', 'starting', 'stopped', 'error'];
    for (const label of labels) {
      this.serverCount.set({ status: label }, 0);
    }
    // Count by status
    for (const s of servers) {
      this.serverCount.inc({ status: s.status });
    }
  }

  /**
   * Get the metrics content for /metrics endpoint.
   */
  async metrics(): Promise<string> {
    return await this.registry.metrics();
  }
}

// Singleton instance (created on first use)
let metricsInstance: AppMetrics | null = null;

export function getMetrics(): AppMetrics {
  if (!metricsInstance) {
    metricsInstance = new AppMetrics();
  }
  return metricsInstance;
}
