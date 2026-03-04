# Observability & Reliability

This document describes the operational observability and reliability features of oh-my-mcp.

---

## Metrics (Prometheus)

oh-my-mcp exposes a Prometheus metrics endpoint on both the management and gateway ports:

- Management: `http://localhost:${managementPort}/metrics`
- Gateway: `http://localhost:${gatewayPort}/metrics`

The endpoint is unprotected (no auth) to allow Prometheus to scrape freely. If needed, use network-level access controls.

### Exported Metrics

- `process_cpu_seconds_total` – CPU time (system + user)
- `process_resident_memory_bytes` – RSS memory
- `process_start_time_seconds` – Start timestamp
- `nodejs_heap_size_total_bytes` – Heap statistics
- `ohmy_mcp_servers_total{status}` – Count of MCP servers by status (`running`, `starting`, `stopped`, `error`)
- `ohmy_mcp_requests_total{method,route,status_code}` – Total HTTP requests processed
- `ohmy_mcp_request_duration_seconds{method,route}` – Request latency histogram (buckets: 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s)
- `ohmy_mcp_errors_total{type,context}` – Count of unhandled errors

### Integration with Prometheus / Netdata

- **Prometheus**: add a new job to `scrape_configs`:
  ```yaml
  - job_name: 'oh-my-mcp'
    static_configs:
      - targets: ['localhost:8080']  # managementPort
    metrics_path: '/metrics'
  ```
  Optionally also scrape the gateway port separately if needed.

- **Netdata**: can ingest Prometheus endpoints via the [Prometheus collector](https://learn.netdata.cloud/cloud/metrics-collection/prometheus/). Point it to `http://<host>:8080/metrics`.

---

## Request/Response Logging

Structured JSON logs are emitted for every HTTP request. Logs include:

- Start: `debug` level with `method`, `path`, `query`
- Finish: `info` for success (2xx/3xx), `warn` for errors (4xx/5xx) with `statusCode` and `durationMs`

Request ID from `request-id` middleware is attached to each log line for correlation.

Example log line:
```json
{
  "level": 30,
  "time": "...",
  "reqId": "...",
  "method": "POST",
  "path": "/servers/example/start",
  "statusCode": 200,
  "durationMs": 45
}
```

---

## Audit Logging

State-changing management operations are logged with an `audit` component tag. Audited actions:

- `POST /servers/:id/start`
- `POST /servers/:id/stop`
- `POST /servers/:id/restart`
- `POST /servers/_start-all`
- `POST /servers/_stop-all`

Audit log fields:
- `timestamp` (ISO)
- `action` (e.g., `start`, `stop`)
- `serverId`
- `token` (masked first 8 characters)
- `ip`
- `statusCode`
- `durationMs`

Example:
```json
{
  "level": 30,
  "time": "...",
  "component": "audit",
  "type": "audit",
  "action": "start",
  "serverId": "example",
  "token": "abc12345...",
  "ip": "192.168.1.2",
  "statusCode": 200,
  "durationMs": 123
}
```

You can route audit logs to a separate file using pino transport or a log shipper (e.g., Filebeat, Logstash) filtering on `component=audit`.

---

## Rate Limiting

Rate limiting is applied to prevent abuse.

### Management API

- Limit: **100 requests per minute** per IP address
- Headers:
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: <remaining>`
- Exceeded: HTTP `429 Too Many Requests` with `Retry-After: <seconds>`

### Gateway API

- Limit: **1000 requests per minute** per bearer token (or IP if no token)
- Same headers and behavior

Rate limiting state is stored in-memory and pruned lazily. It is not shared across multiple instances; for multi-replica deployments, put a reverse proxy (e.g., Envoy, Nginx) in front with its own rate limiting.

---

## Response Compression

Responses are compressed with gzip in production when `compression` config is true (default) and payload size exceeds 1 KB. Compression is disabled in `development` mode.

Configure via `config.yaml`:
```yaml
compression: true  # or false to disable globally
```

---

## Request Timeouts

### Gateway API

- Global timeout: **60 seconds**
- If a request takes longer, returns `504 Gateway Timeout`
- Configured via `timeoutMiddleware(60000)`

### Management API

- Global timeout: **120 seconds**

Note: Individual MCP servers also have a `timeout` config (default 60s) that applies to JSON-RPC calls made by the gateway to the backend server. This is separate from the gateway's own request timeout.

---

## Structured Logging

All logs are JSON via [pino](https://getpino.io/). Log level configurable in `config.yaml` (`logLevel: debug|info|warn|error`).

Log fields include:
- `level` (numeric, per Pino)
- `time`
- `reqId` (request ID, present when `request-id` middleware ran)
- `component` (where applicable: `audit`, etc.)
- `msg`
- any structured fields passed to `logger.debug/info/warn/error`

---

## Configuration Validation

On startup, the configuration is validated against the Zod schema. If validation fails:
- An error log is emitted (structured, includes config path)
- Process exits with code `1`

This ensures misconfiguration is caught early.

---

## Health Checks

Two health endpoints:

- `GET /health` – Application health, returns `{ status: "ok", servers: <count> }`
- `GET /servers/:id/health` – Individual server health check (via manager); returns `{ id, healthy, lastCheck }`

These can be used by orchestration systems (K8s probes, load balancers).

---

## Best Practices for Production

1. **Load Balancing**: Run multiple replicas behind a reverse proxy (Nginx, Envoy, Traefik). Use the gateway port as the service endpoint.
2. **Metrics**: Scrape `/metrics` with Prometheus. Set up alerts for:
   - High request latency (`ohmy_mcp_request_duration_seconds` p95 > threshold)
   - High error rate (`ohmy_mcp_errors_total` rate)
   - Low server count (all servers down)
3. **Logging**: Ship JSON logs to a centralized system (Elastic, Loki, Datadog). Filter audit logs separately.
4. **Rate Limiting**: Adjust limits via middleware code or make them configurable in a future release.
5. **Timeouts**: Tune gateway vs MCP server timeouts based on expected workload.
6. **TLS**: Put oh-my-mcp behind a TLS-terminating proxy; do not expose directly to the internet without authentication and TLS.
7. **Resource Limits**: Docker/K8s deployments should set CPU/memory limits; monitor with Node Exporter and app metrics.

---

## Troubleshooting

- **High latency**: Check `ohmy_mcp_request_duration_seconds` histogram; look at gateway or individual MCP servers.
- **Frequent restarts**: Look for error logs from `ProcessManager`; check server exit codes.
- **Rate limit hits**: Monitor `X-RateLimit-Remaining` headers; adjust limits if legitimate traffic is blocked.
- **Compression not working**: Ensure `compression: true` and `NODE_ENV !== development`; check `Content-Encoding` header in responses.
- **No metrics**: Ensure `/metrics` endpoint is accessible; verify prom-client is registered; check for early initialization issues.

---

## References

- [Prometheus Client](https://github.com/siimon/prom-client)
- [pino](https://github.com/pinojs/pino)
- [compression](https://github.com/expressjs/compression)