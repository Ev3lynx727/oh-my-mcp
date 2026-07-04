# oh-my-mcp

> Native MCP gateway with management layer — stdio and supergateway transports

oh-my-mcp is a gateway and process manager for [Model Context Protocol](https://github.com/modelcontextprotocol/spec) servers. It starts MCP servers (via supergateway or native stdio transport), monitors their health, and exposes a unified HTTP API for clients like Claude Desktop, Cursor, Windsurf, and OpenCode.

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
- **Transport abstraction**: supergateway (HTTP/SSE) and stdio (native JSON-RPC).
- **Auth system**: Bearer token authentication with auto-generated token support.

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

## 📚 Documentation

Comprehensive guides for advanced usage, deployment, and integration:

| Guide | Purpose |
|-------|---------|
| **[Installation](docs/installation.md)** | Setup, config, security |
| **[Quick Start](docs/quickstart.md)** | Get running in 5 minutes |
| **[Configuration](docs/configuration.md)** | All YAML options explained |
| **[Transport Modes](docs/transport-modes.md)** | Supergateway vs DirectStdioTransport |
| **[API Reference](docs/api-reference.md)** | All endpoints with examples |
| **[Server Management](docs/server-management.md)** | CLI and API server lifecycle |
| **[Architecture](docs/architecture.md)** | System design and modules |
| **[Hot Reload](docs/hot-reload.md)** | Config reload strategies |
| **[Gateway Schema](docs/gateway-schema.md)** | Gateway API wire format |
| **[Integrations](docs/integrations.md)** | Claude Desktop, Cursor, Windsurf, OpenCode |
| **[Troubleshooting](docs/troubleshooting.md)** | Common issues and fixes |
| **[Development](docs/development.md)** | Building and testing |
| **[Contributing](docs/contributing.md)** | PR workflow and conventions |

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
  autoGenerate: false
  tokens:
    - "your-secret-token"

servers:
  ark-exec:
    command: ["node", "/path/to/ark-exec/dist/server.js"]
    cacheTtl: 60000
    timeout: 30000
    enabled: true
    transport: supergateway
    url: http://localhost:8101/sse
```

See `docs/configuration.md` for all options.

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

### Gateway API

MCP JSON-RPC requests proxy through `POST /mcp/:serverId` on the management API (port 8080).

**Headers**:

- `Authorization: Bearer <token>` (if auth enabled)

**Body**: Standard MCP JSON-RPC 2.0 request.

Example:

```bash
curl -X POST http://localhost:8080/mcp/ark-exec \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The gateway dispatches via the server's configured transport (DirectStdio or supergateway). Servers using supergateway SSE on a dedicated port can also be connected to directly at their SSE endpoint (e.g. `http://localhost:8101/sse`).

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



---

## Deployment

### Docker

Dockerfile not yet published — tracked in [Phase 4 backlog](https://github.com/Ev3lynx727/oh-my-mcp/blob/develop/BACKLOG.md). For now, run directly:

```bash
git clone https://github.com/ev3lynx/oh-my-mcp
cd oh-my-mcp
npm ci && npm run build
node dist/index.js config.yaml
```

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

Architecture overview: [`docs/architecture.md`](docs/architecture.md).

---

## Roadmap

- OAuth2 / JWT pluggable auth
- React management UI
- WebSocket streaming support
- OpenAPI specification

## Credits

- Uses [supergateway](https://github.com/supercorp-ai/supergateway) to bridge HTTP and stdio for MCP servers.

---

## Contributing

See [`docs/contributing.md`](docs/contributing.md). We welcome issues and PRs.

---

## License

MIT – see [LICENSE](LICENSE) for details.
