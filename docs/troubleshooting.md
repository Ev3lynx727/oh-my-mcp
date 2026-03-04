# Troubleshooting

This guide helps diagnose common issues with oh-my-mcp.

---

## Startup Issues

### Container/Pod exits immediately

**Symptoms:** `docker ps` shows container not running; Kubernetes pod in `CrashLoopBackOff`.

**Causes:**

- Config file not found or invalid.
- Port already in use.
- Missing dependencies (e.g., `npx` cannot reach npm).

**Action:**

- Check logs: `docker logs <container>` or `kubectl logs <pod>`.
- If config error, correct the YAML file path or contents. The process exits with code 1 and logs a structured error.
- For port conflicts, either change mapped ports or let the app pick random ones (not yet supported; manual port assignment required).
- If supergateway is missing, ensure network access to npm registry. In air-gapped environments, preinstall supergateway globally in the image.

### Configuration validation fails

**Symptoms:** Logs show "Configuration validation failed" with Zod error details.

**Action:**

- The error message points to the problematic field. Verify required fields (`servers.*.command`) are arrays of strings.
- Ensure numeric fields are numbers, booleans are booleans.
- Remove unknown keys.

---

## Runtime Issues

### Server repeatedly crashes and restarts

**Symptoms:** `ps` shows processes spawning and exiting; logs show `server process exited` with non-zero code.

**Causes:**

- Backend MCP server binary not found.
- Missing environment variables.
- The server itself encounters an error.

**Action:**

- Check server logs: look for `stdout` and `stderr` events in your logging system. They contain output from the MCP server process.
- Verify `command` in config is correct and resolvable in PATH (or use absolute path).
- Ensure any required env vars are set (with correct values).
- Try running the command manually on the host (outside supergateway) to see if it starts.

### Gateway requests time out (504)

**Symptoms:** Client receives `504 Gateway Timeout` after 60 seconds.

**Causes:**

- Backend MCP server is too slow or not responding.
- Supergateway connection broken.
- Network issues.

**Action:**

- Verify server health: `GET /health` should show servers RUNNING. If health is bad, the server may be stuck.
- Check server-specific health: `GET /servers/:id/health` (if implemented).
- Increase server `timeout` config if the backend legitimately needs more time.
- Inspect logs for errors from the transport layer.
- Test connectivity manually: `curl -X POST <http://localhost:{port}/mcp> -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'` (the port assigned to the server; can be found via `GET /servers`).

### High request latency

**Symptoms:** Slow responses; Prometheus `ohmy_mcp_request_duration_seconds` shows high percentiles.

**Causes:**

- Backend MCP server is slow.
- Resource contention (CPU/memory).
- too many requests (rate limiting not kicking in early enough).
- Network latency (if across nodes).

**Action:**

- Check `GET /health` and server-specific health.
- Monitor system metrics (Node Exporter, container metrics).
- If using Docker/K8s, ensure resources are sufficient.
- Consider enabling compression for large responses.
- Add more replicas of oh-my-mcp behind a load balancer.

### 429 Too Many Requests

**Symptoms:** Client receives 429 with `Retry-After`.

**Causes:**

- Rate limit exceeded.

**Action:**

- Adjust limits in middleware (hardcoded currently; future config).
- Ensure clients are not misbehaving.
- If legitimate traffic, consider increasing limits or adding a caching layer.

---

## Observability Issues

### Metrics not appearing in Prometheus

**Symptoms:** Prometheus scrape fails or missing metrics.

**Causes:**

- `/metrics` endpoint not accessible (firewall, auth, port wrong).
- Prometheus not configured to scrape the right port.
- Application crashed before collecting default metrics.

**Action:**

- Manually curl `http://localhost:8080/metrics`. Should return plain text with `process_cpu_seconds_total`.
- Check Prometheus targets page for errors.
- Ensure metrics endpoint is not behind auth (by default it is not).
- Verify `prom-client` is installed and registered.

### Logs not structured JSON

**Symptoms:** Log lines are plain text or missing fields.

**Causes:**

- `NODE_ENV` set to `development`? Pino may use pretty-print.
- Custom logger configuration overridden.

**Action:**

- Set `NODE_ENV=production` for JSON logs.
- Ensure `initLogger` is called early with correct level.
- Check that you are not using a custom pino transport that changes format.

### Audit logs missing

**Symptoms:** No audit records for start/stop operations.

**Causes:**

- Audit middleware not mounted (should be on management app).
- The request path did not match audit criteria (must be POST to `/servers/:id/start|stop|restart` or `/_start-all|_stop-all`).

**Action:**

- Verify middleware order in `src/index.ts`.
- Confirm you are using the correct HTTP method and path.
- Look for `component: "audit"` tag in logs.

---

## Security Issues

### Unauthorized access to management API

**Symptoms:** You can access `/servers` without a token.

**Causes:**

- `auth` section missing in config, or `enabled: false`.
- `createAuthMiddleware` not mounted.

**Action:**

- Add to `config.yaml`:

  ```yaml
  auth:
    enabled: true
    tokens:

      - "your-secret-token"

  ```

- Restart the app.
- Use `Authorization: Bearer your-secret-token` header for management requests.

### TLS/HTTPS not working

**Symptoms:** Browsers warn about insecure connections.

**Causes:** oh-my-mcp does not provide TLS itself; you must put a reverse proxy (Nginx, Traefik, Caddy) in front that handles HTTPS.

**Action:**

- Deploy behind an Ingress with TLS (K8s) or configure Nginx as a frontend.
- Obtain certificates from Let's Encrypt or your CA.

---

## Performance Issues

### High memory usage

**Symptoms:** Container OOM kills; Node RSS grows.

**Causes:**

- Too many MCP servers running concurrently (each supergateway process uses memory).
- Log buffers not flushed.
- Metrics registry accumulating many time series (unbounded cardinality).

**Action:**

- Limit number of concurrent servers; stop unused ones.
- Configure log rotation and/or external shipping.
- Ensure metrics labels are bounded (they are: method, route, status). Avoid injecting user input as labels (we don't).

### Port exhaustion

**Symptoms:** Cannot allocate port; `PortAllocator` wraps indefinitely.

**Causes:**

- Many servers started over time without release (auto-restart thrashing).
- Manual ports conflict.

**Action:**

- Check server status; stop unnecessary servers.
- Review auto-restart logic; consider backoff.

---

## Debugging Steps

1. **Check health**: `curl <http://localhost:8080/health`>
2. **List servers**: `curl -H "Authorization: Bearer <token>" <http://localhost:8080/servers`>
3. **Inspect logs**: Look for `error` level and component tags (`audit`, `server`).
4. **Test gateway manually**:

   ```bash
   curl -X POST http://localhost:8090/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
   ```

5. **Prometheus metrics**: `curl <http://localhost:8080/metrics`> and grep for `ohmy_mcp`.
6. **Process listing**: `ps aux | grep supergateway` to see child processes.

---

## Known Limitations

- Rate limiting is in-memory; replicas do not share state.
- Transport for direct stdio MCP servers not implemented (DirectStdioTransport stub).
- No built-in UI (management is via API only).
- Config reloading via file watch is implemented but stateful changes (port allocation) may not be perfectly cleaned; a full restart recommended after major config changes.

---

## Getting Help

- Open an issue on GitHub: <https://github.com/your-org/oh-my-mcp/issues>
- Community Discord: #support

Include:

- Version (`git describe --tags` or image tag)
- Config (redact secrets)
- Relevant logs (structured JSON)
- Steps to reproduce.
