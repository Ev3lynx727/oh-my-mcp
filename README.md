# oh-my-mcp

> Manage MCP servers and proxy JSON-RPC over HTTP

oh-my-mcp is a gateway and process manager for [Model Context Protocol](https://github.com/modelcontextprotocol/spec) servers. It starts MCP servers (via supergateway), monitors their health, and exposes a unified HTTP API for clients like Claude Desktop, Cursor, and Windsurf.

---

## Features

- **Process management**: start/stop/restart individual or all servers with automatic restart on failure.
- **HTTP gateway**: Proxy MCP JSON-RPC (`POST /mcp`) with server selection via `Server-Id` header.
- **Observability**:
  - Prometheus metrics (`/metrics`)
  - Structured JSON logging (request/response + audit)
  - Rate limiting (per-IP management, per-token gateway)
  - Request timeouts (60s gateway, 120s management)
- **Configuration as code**: YAML config with hot-reload; Zod validation.
- **Transport abstraction**: currently HTTP via supergateway; stdio transport planned.
- **Docker & Kubernetes ready**: deploy with included guides.

---

## Quick Start

```bash
# 1. Clone and build
git clone https://github.com/ev3lynx/oh-my-mcp
cd oh-my-mcp
npm ci
npm run build

# 2. Create config (see config.example.yaml)
cp config.example.yaml config.yaml
# Edit config.yaml with your MCP servers

# 3. Run
node dist/index.js config.yaml
```

The app starts:

- Management API on `http://localhost:8080`
- Gateway API on `http://localhost:8090`

---

## Configuration

`config.yaml`:

```yaml
managementPort: 8080
gatewayPort: 8090
logLevel: info
compression: true

auth:
  enabled: true
  tokens:
    - "your-secret-token"

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

See `config.example.yaml` for all options.

---

## API

### Management API (port 8080)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | no | Application health: `{ status, servers }` |
| `/servers` | GET | yes | List all servers with status |
| `/servers/:id` | GET | yes | Get single server details |
| `/servers/:id/start` | POST | yes | Start a server |
| `/servers/:id/stop` | POST | yes | Stop a server |
| `/servers/:id/restart` | POST | yes | Restart a server |
| `/_start-all` | POST | yes | Start all enabled servers |
| `/_stop-all` | POST | yes | Stop all running servers |
| `/metrics` | GET | no | Prometheus metrics |

**Authentication**: Include `Authorization: Bearer <token>` if auth enabled.

### Gateway API (port 8090)

`POST /mcp` proxies any JSON-RPC request to the selected backend.

**Headers**:
- `Server-Id` (optional): which server to route to (default: first enabled)
- `Authorization: Bearer <token>` (if auth enabled)

**Body**: Standard MCP JSON-RPC 2.0 request.

Example:

```bash
curl -X POST http://localhost:8090/mcp \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}'
```

Response is passed through from the backend server.

---

## Observability

- **Metrics**: `GET http://localhost:8080/metrics` (Prometheus format). Includes:
  - `ohmy_mcp_servers_total{status}`
  - `ohmy_mcp_requests_total{method,route,status_code}`
  - `ohmy_mcp_request_duration_seconds{method,route}`
  - `process_*` system metrics
- **Logging**: JSON logs to stdout. Request IDs in `X-Request-ID` and logs. Audit events logged with `component=audit`.
- **Health**: `GET /health` for overall; per-server: `GET /servers/:id/health` (future).
- **Rate limiting**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` headers.

Full guide: `docs/observation.md`.

---

## Deployment

### Docker

```bash
docker build -t oh-my-mcp .
docker run -d -p 8080:8080 -p 8090:8090 -v $(pwd)/config.yaml:/app/config.yaml oh-my-mcp
```

See `docs/deployment/docker.md`.

### Kubernetes

Manifests provided: `docs/deployment/kubernetes.md`.

Use ConfigMap for config, Secret for tokens, and HPA for scaling.

---

## Development

```bash
npm run dev        # watch mode with tsx
npm run build      # compile to dist
npm test           # unit + integration
npm run lint       # eslint
```

Project structure:

- `src/domain` – Pure domain model (`MCPServer`, `ServerTransport`)
- `src/application` – ProcessManager, PortAllocator, EventBus, HealthChecker
- `src/infrastructure` – Config, HTTP, transports, metrics
- `src/middleware` – Express middleware (timeout, rate-limit, audit, logging, etc.)
- `src/index.ts` – App bootstrap and wiring

Architecture overview: `docs/architecture.md`.

---

## Roadmap

- `DirectStdioTransport` for native stdio MCP servers
- Distributed rate limiting (Redis)
- OAuth2 / JWT authentication
- React management UI
- Request/response caching
- WebSocket streaming support
- OpenAPI specification

---

## Contributing

See `docs/contributing.md`. We welcome issues and PRs.

---

## License

MIT – see [LICENSE](LICENSE) for details.
