# API Reference

oh-my-mcp exposes two HTTP APIs:

- **Gateway API** – MCP JSON-RPC proxy (default port 8090)
- **Management API** – Control plane for server lifecycle (default port 8080)

Both APIs support CORS if needed (configure via reverse proxy). All endpoints return JSON unless noted.

---

## Base URLs

- Management: `http://localhost:8080`
- Gateway: `http://localhost:8090`

Adjust ports according to your configuration (`managementPort`, `gatewayPort`).

---

## Authentication

Management API endpoints (except `/health` and `/metrics`) require a bearer token.

Include header:

```
Authorization: Bearer <your-token>
```

Tokens are configured in `config.yaml`:

```yaml
auth:
  enabled: true
  tokens:
    - "secret1"
    - "secret2"
```

The Gateway API also uses the same bearer token scheme for clients.

If no tokens are configured or `auth.enabled` is false, all endpoints are open.

---

## Common Error Responses

All endpoints may return:

| Status | Body | Meaning |
|--------|------|---------|
| 401 | `{ "error": "Unauthorized" }` | Missing or invalid token |
| 403 | `{ "error": "Forbidden" }` | Token not in allowlist (if configured) |
| 404 | `{ "error": "Not Found" }` | Endpoint or server ID not found |
| 429 | `{ "error": "Too many requests", "retryAfter": <seconds> }` | Rate limit exceeded |
| 500 | `{ "error": "...", "details": ... }` | Internal server error |
| 504 | `{ "error": "Gateway timeout", "detail": "..." }` | Request to backend MCP server timed out |

---

## Management API

### GET /health

Application health check. No authentication required.

**Response 200:**

```json
{
  "status": "ok",
  "servers": <number of enabled servers>
}
```

---

### GET /servers

List all configured servers with their runtime status.

**Headers:** `Authorization: Bearer ...`

**Response 200:**

```json
[
  {
    "id": "example",
    "name": "example",
    "config": {
      "command": ["npx", "-y", "@mcp/server"],
      "env": {},
      "timeout": 60000,
      "port": 8100,
      "enabled": true,
      "transport": "supergateway"
    },
    "status": "running",
    "port": 8100,
    "startedAt": "2024-01-01T00:00:00.000Z",
    "health": true,
    "error": null
  }
]
```

`status` values: `stopped`, `starting`, `running`, `error`, `stopping`.

---

### GET /servers/:id

Get detailed info for a single server (same fields as list entry).

**Headers:** `Authorization: Bearer ...`

**Response:** 200 with server object, or 404 if not found.

---

### POST /servers/:id/start

Start a stopped server.

**Headers:** `Authorization: Bearer ...`

**Response:**

- 200 on success (server will transition to `starting` then `running`): `{ "started": true }`
- 400 if server is already running or invalid state.
- 404 if server not found.

**Audit:** This action is logged to audit log.

---

### POST /servers/:id/stop

Stop a running server.

**Headers:** `Authorization: Bearer ...`

**Response:**

- 200 on success: `{ "stopped": true }`
- 400 if server is already stopped.
- 404 if not found.

**Audit:** Logged.

---

### POST /servers/:id/restart

Restart a server (stop then start).

**Headers:** `Authorization: Bearer ...`

**Response:**

- 200: `{ "restarted": true }`
- 404 if not found.

**Audit:** Logged.

---

### POST /servers/_start-all

Start all enabled servers (bulk operation).

**Headers:** `Authorization: Bearer ...`

**Response:** `{ "started": ["id1","id2"] }`

**Audit:** ServerId field will be `"multiple"`.

---

### POST /servers/_stop-all

Stop all running servers (bulk).

**Headers:** `Authorization: Bearer ...`

**Response:** `{ "stopped": ["id1","id2"] }`

**Audit:** ServerId field will be `"multiple"`.

---

### GET /metrics

Prometheus metrics exposition. No authentication.

**Response 200:** `text/plain; version=0.0.4`

Body:

```
# HELP process_cpu_seconds_total ...
process_cpu_seconds_total 0.5
# HELP ohmy_mcp_servers_total ...
ohmy_mcp_servers_total{status="running"} 2
...
```

See `docs/observation.md` for metric names and descriptions.

---

## Gateway API

The gateway API speaks MCP over HTTP. Clients send JSON-RPC requests to `POST /mcp`.

### POST /mcp

Proxy any MCP method to the appropriate backend server. The server target is determined by the `Server-Id` header (or `default` server if absent).

**Headers:**
- `Server-Id` (optional): The ID of the MCP server to route to. If omitted, the `default` server (first enabled) is used.
- `Authorization: Bearer ...` (if auth enabled)

**Body:** JSON-RPC 2.0 request object:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "client", "version": "1.0.0" }
  }
}
```

**Response:** Passed through from the backend server. Typical success: `200` with:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... }
}
```

**Error Responses:**

- 400 if body invalid JSON or missing required fields.
- 404 if requested server ID is not found or not running.
- 504 if backend request times out.
- 502 if backend returns an error (e.g., connection refused, invalid response).
- 429 if rate limited.

**Notes:**

- The gateway does not interpret the JSON-RPC; it forwards to the server's `supergateway` endpoint.
- Streaming (`notifications`) are not currently forwarded; the protocol is request/response only.

---

## Configuration Example

`config.yaml`:

```yaml
managementPort: 8080
gatewayPort: 8090
logLevel: info
compression: true
auth:
  enabled: true
  tokens:
    - "my-secret-token"
servers:
  github:
    command: ["npx", "-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: "${GH_TOKEN}"
    timeout: 60000
    enabled: true
    transport: "supergateway"
    healthCheck:
      interval: 30000
      timeout: 5000
      unhealthyThreshold: 3
```

---

## Rate Limit Headers

Every response includes:

- `X-RateLimit-Limit`: requests per window (e.g., 100)
- `X-RateLimit-Remaining`: remaining requests in current window (0 when exhausted)

When limited, also `Retry-After: <seconds>`.

---

## Request IDs

The `request-id` middleware adds a unique `X-Request-ID` header to responses and includes the ID in logs. This helps trace a request across logs and metrics.

---

## Health Check Endpoint Variants

In addition to `/health`, you can query per-server health via:

`GET /servers/:id/health` – returns:

```json
{
  "id": "github",
  "healthy": true,
  "lastCheck": "2024-01-01T00:00:00.000Z"
}
```

---

## Metadata Endpoint

`GET /metadata` (if implemented) or similar will expose version and build info. Currently not present; will be added in future.

---

## Example Usage

```bash
# Health
curl http://localhost:8080/health

# List servers (with token)
curl -H "Authorization: Bearer my-secret-token" \
  http://localhost:8080/servers

# Start a server
curl -X POST -H "Authorization: Bearer my-secret-token" \
  http://localhost:8080/servers/github/start

# Proxy MCP initialize
curl -X POST http://localhost:8090/mcp \
  -H "Authorization: Bearer my-secret-token" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "0.1"}
    }
  }'
```

---

## Versioning

The API is versioned implicitly; breaking changes will increment the major version and be reflected in the URL (e.g., `/v1/mcp`) in the future. Currently, all endpoints are at root.

---

## WebSockets / Streaming

Not supported. The gateway operates in pure request/response mode. For streaming MCP notifications, a separate protocol extension may be added later.

---

## OpenAPI Spec

An OpenAPI/Swagger spec is not yet provided. Contributions welcome.
