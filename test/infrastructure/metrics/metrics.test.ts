import { describe, it, expect, beforeEach } from 'vitest';
import { AppMetrics } from '../../../src/infrastructure/metrics/metrics.ts';

describe('AppMetrics', () => {
  let metrics: AppMetrics;

  beforeEach(() => {
    metrics = new AppMetrics();
  });

  it('should have default process metrics registered', async () => {
    const text = await metrics.registry.metrics();
    expect(text).toContain('process_cpu_seconds_total');
    expect(text).toContain('process_resident_memory_bytes');
  });

  it('should recordRequest increments request counter', async () => {
    metrics.recordRequest('GET', '/test', 200);
    const text = await metrics.registry.metrics();
    expect(text).toContain('ohmy_mcp_requests_total');
    expect(text).toContain('method="GET"');
    expect(text).toContain('route="/test"');
    expect(text).toContain('status_code="200"');
  });

  it('should observeDuration adds to histogram', async () => {
    metrics.observeDuration('POST', '/api', 0.123);
    const text = await metrics.registry.metrics();
    expect(text).toContain('ohmy_mcp_request_duration_seconds');
    expect(text).toContain('method="POST"');
    expect(text).toContain('route="/api"');
  });

  it('should update server counts correctly', async () => {
    metrics.updateServerCounts([
      { status: 'running' },
      { status: 'running' },
      { status: 'stopped' },
    ]);
    const text = await metrics.registry.metrics();
    expect(text).toContain('ohmy_mcp_servers_total{status="running"} 2');
    expect(text).toContain('ohmy_mcp_servers_total{status="stopped"} 1');
  });

  it('should recordError increments errors counter', async () => {
    metrics.recordError('timeout', 'gateway');
    const text = await metrics.registry.metrics();
    expect(text).toContain('ohmy_mcp_errors_total');
    expect(text).toContain('type="timeout"');
    expect(text).toContain('context="gateway"');
  });
});
