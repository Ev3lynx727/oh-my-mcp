# Architecture

oh-my-mcp is a gateway and manager for Model Context Protocol (MCP) servers. It exposes a unified HTTP API (the *gateway*) that proxies JSON-RPC requests to backend MCP servers, which may run over stdio or HTTP.

This document describes the high-level architecture, key components, and data flow.

---

## High-Level Overview

```
+---------------------+      +----------------------+      +-----------------------+
|   Client / Claude   | ---> |   Gateway API (8090)| ---> |   MCP Servers        |
|   Desktop / etc.    |      |   /mcp endpoint     |      |   (via transport)    |
+---------------------+      +----------------------+      +-----------------------+
                                  ^  |
                                  |  | (HTTP proxy)
                                  |  v
                           +-------------------+
                           | ServerManager     |
                           | - ProcessManager  |
                           | - PortAllocator   |
                           | - Transport layer |
                           +-------------------+
                                  ^
                                  | (control)
                           +-------------------+
                           |  State: Domain   |
                           |  MCPServer        |
                           +-------------------+
```

- **Gateway API** (`gatewayPort`, default 8090): Handles MCP JSON-RPC over HTTP, proxies to backend servers.
- **Management API** (`managementPort`, default 8080): Provides control plane (start/stop/status/config).
- **ServerManager**: Coordinates server lifecycle, health, and request routing.
- **ProcessManager**: Spawns/monitors OS processes.
- **Transport**: Abstraction for communicating with an MCP server (HTTP via supergateway, or direct stdio).
- **Domain model**: `MCPServer` captures state (status, port, health) and configuration.

---

## Core Layers

### 1. Domain Layer (`src/domain/`)

Pure business logic and state, free of infrastructure concerns.

- **`Server.ts`**: `MCPServer` class holds identity, configuration, runtime state (status, port, health, error, timestamps). Methods mutate state and emit events.
- **`ServerStatus.ts`**: TypeScript enum for server lifecycle (`STOPPED`, `STARTING`, `RUNNING`, `ERROR`, `STOPPING`).
- **`Transport.ts`**: Interface `ServerTransport` for communication with a running MCP server. Implementations: `SuperGatewayTransport` (HTTP), `DirectStdioTransport` (stub).

### 2. Application Layer (`src/application/`)

Orchestration and use cases.

- **`ProcessManager.ts`**: OS process lifecycle (spawn, stop, restart). Hardcoded to use supergateway currently.
- **`PortAllocator.ts`**: Manages port assignments (automatic and manual). Uses LIFO stack for reuse.
- **`EventBus.ts`**: Simple pub/sub for domain events (`statusChange`, `log`, `serverStarted`, etc.).
- **`HealthChecker.ts`**: Periodic health checks for running servers (calls `tools/list`).
- **`adapters.ts`**: Conversion between legacy `ServerConfig` (from YAML) and domain model fields.

### 3. Infrastructure Layer (`src/infrastructure/`)

External concerns: HTTP, config loading, logging, metrics, transports.

- **`config/`**:
  - `ConfigCache.ts`: In-memory TTL cache for parsed YAML config.
  - `config_loader.ts`: Loads, validates (Zod), and watches config file.
- **`http/HttpClient.ts`**: Thin wrapper around `fetch` with retry/timeout (future).
- **`transports/`**:
  - `SuperGatewayTransport.ts`: Communicates with server via HTTP (supergateway).
  - `DirectStdioTransport.ts`: Stub for future stdio.
  - `TransportFactory.ts`: Creates transports based on config.
- **`metrics/`**:
  - `metrics.ts`: `AppMetrics` singleton with Prometheus metrics.
  - `middleware.ts`: `metricsMiddleware`, `metricsHandler` (`/metrics` endpoint).

### 4. Presentation Layer (`src/index.ts` and `src/api.ts`, `src/gateway.ts`)

- **`index.ts`**: Express app setup, wires middleware, starts ServerManager.
- **`api.ts`**: Management API routes (CRUD for servers, bulk actions).
- **`gateway.ts`**: Gateway API route (`/mcp`) that uses `ServerManager` to forward requests to the appropriate transport.

### 5. Cross-Cutting Concerns (`src/middleware/`)

- **`request-id.ts`**: Assigns unique request ID (used for log correlation).
- **`error-handler.ts`**: Central error formatter.
- **`timeout.ts`**: Request timeout (management 120s, gateway 60s).
- **`rate-limit.ts`**: Rate limiting (IP-based for management, token-based for gateway).
- **`audit.ts`**: Audit logging for management state changes.
- **`logging.ts`**: Request/response logging (debug start, info/warn finish).

---

## Dependency Injection (DI)

We use a simple DI container (`src/di/container.ts`) with singleton registrations.

Key bindings in `AppModule`:

- `HttpClient` → `HttpClient` (singleton)
- `ConfigCache` → `ConfigCache` (singleton)
- `EventBus` → `EventBus` (singleton)
- `PortAllocator` → `PortAllocator(8100)` (singleton)
- `ProcessManager` → `ProcessManager` (singleton)
- `TransportFactory` → `TransportFactory(HttpClient)` (singleton)
- `ServerManager` → `ServerManager(eventBus, portAllocator, processManager, transportFactory, basePort)` (singleton)

DI allows easy testing (mock dependencies) and decouples construction from usage.

---

## Data Flow: Proxying a Request

1. **Client** sends `POST /mcp` with JSON-RPC body to gateway port (8090).
2. **Gateway** receives request; goes through:
   - `requestIdMiddleware` (assigns ID)
   - `requestResponseLogging` (logs start)
   - `compression` (if enabled)
   - `timeoutMiddleware` (60s deadline)
   - `metricsMiddleware` (records request)
   - `authMiddleware` (checks bearer token or IP allowlist)
   - `rateLimit` (per-token)
3. `createGatewayAPI` router extracts `method` and `params` from JSON-RPC, finds target server from URL path (or default), and calls:
   - `ServerManager.getServerInfo(id)`? Actually the route uses `ServerManager` to send the request via the server's transport.
   - Gateway uses `transport.sendRequest(server, request)` (the transport selected by `ServerManager` during startup).
4. **Transport** (e.g., `SuperGatewayTransport`) makes an HTTP POST to `http://localhost:{port}/mcp` and returns the parsed JSON response.
5. Gateway returns that response to the client.
6. `requestResponseLogging` logs completion with status and duration.
7. `metricsMiddleware` records duration histogram.

---

## Process Lifecycle

- **Startup** (`ServerManager.startServer(id)`):
  1. `adaptLegacyConfig` converts YAML config into domain config.
  2. `MCPServer.fromRawConfig` creates domain server with `STOPPED` → `STARTING`.
  3. `PortAllocator` assigns a port (static or auto).
  4. `ProcessManager.startServer(server, config, port)` spawns supergateway process.
  5. `TransportFactory` creates transport (e.g., `SuperGatewayTransport`).
  6. `transport.isReady(server)` polls until the server responds to `initialize`.
  7. State → `RUNNING`; port stored; process reference in server state.

- **Stopping** (`ServerManager.stopServer(id)`):
  1. `ProcessManager.stopServer(server)` sends SIGTERM, then SIGKILL after timeout.
  2. Port released if auto-allocated.
  3. State → `STOPPED`.
  4. Event `serverStopped` emitted.

- **Auto-restart**: If process exits with non-zero code, `ServerManager` schedules a restart after 5 seconds (configurable).

---

## Configuration

See `config.example.yaml`. Top-level settings:

```yaml
managementPort: 8080
gatewayPort: 8090
logLevel: info|debug|warn|error
compression: true|false  # gzip in prod
servers:
  serverId:
    command: ["npx", "-y", "@mcp/server"]
    transport: "supergateway" | "stdio"
    timeout: 60000        # per-request timeout (ms)
    port: 0               # optional manual port
    enabled: true
    healthCheck:
      interval: 30000
      timeout: 5000
      unhealthyThreshold: 3
```

Validation: `ConfigSchema` (Zod) enforces types and defaults.

---

## Observability

- **Metrics**: `GET /metrics` on both ports; Prometheus format; includes server counts, request latency, errors, process metrics.
- **Logging**: JSON via pino. Request/response logging with request IDs. Audit logging for management actions.
- **Rate Limiting**: Management (100/min per IP), Gateway (1000/min per token).
- **Health**: `GET /health` returns `{ status: "ok", servers: N }`.

See `docs/observation.md` for details.

---

## Error Handling

- Central `errorHandler` converts errors to JSON `{ error: string, details?: any }`.
- Timeouts return `504` with `{ error: "Gateway timeout", detail: "..." }`.
- Auth failures: `401` with `WWW-Authenticate: Bearer` challenge if token required.
- Rate limit: `429` with `Retry-After` header.
- Server start/stop errors propagate to client with `500` and error message.

---

## Extensibility

- **New transports**: Implement `ServerTransport` and register in `TransportFactory`. ProcessManager remains responsible for process spawning.
- **Auth schemes**: Extend `createAuthMiddleware` (currently bearer token + IP allowlist).
- **Metrics**: Add new `prom-client` counters/gauges in `AppMetrics`.
- **Middleware**: Insert at appropriate point in `src/index.ts` pipeline.

---

## Testing

- Unit tests under `test/` using Vitest and Supertest.
- Integration test starts the entire application with a real MCP server via supergateway.
- Build + typecheck + lint + test + coverage runs in CI.

---

## Future Directions

- Make transport spawn behavior configurable (remove supergateway hardcoding).
- Implement `DirectStdioTransport` for native stdio MCP servers.
- Add distributed rate limiting (Redis-backed) for multi-replica deployments.
- Provide a React UI for management and logs.
- Add OAuth2 and JWT-based auth.
- Implement request/response caching.
