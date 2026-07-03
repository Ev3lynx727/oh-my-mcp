# CE: oh-my-mcp (@ev3lynx/oh-my-mcp) — Context Engineer Handoff

## Identity

HTTP MCP gateway + process manager. Spawns stdio MCP servers via supergateway (HTTP/SSE) or DirectStdioTransport (native JSON-RPC over stdin/stdout). Exposes them behind a single HTTP API with auth, rate limiting, metrics, and hot-reload config. For Claude Desktop, Cursor, Windsurf sharing the same MCP server pool.

`@ev3lynx/oh-my-mcp` v1.0.2-pre — MIT, TypeScript, Node >=18.

## Architecture

```
src/
├── index.ts                     Bootstrap: 2 Express apps, middleware chains, hot-reload, shutdown
├── config.ts                    Zod schemas (ConfigSchema, ServerConfigSchema, AuthConfigSchema)
├── config_loader.ts             YAML/JSON loading, chokidar watcher, reload + rollback
├── logger.ts                    pino singleton
├── auth.ts                      Bearer token middleware (single or multi-token)
├── gateway.ts                   Gateway router: POST /mcp/:serverId -> proxyMCPRequest (stdio or HTTP)
├── server_manager.ts            ServerManager: lifecycle orchestrator (start/stop/restart/health)
├── api.ts                       Management API router (CRUD servers, SSE logs, bulk operations)
├── api/schemas.ts               Zod validation for API params/query
├── cli/schemas.ts               CLI arg parsing (Zod), showHelp, showVersion
├── di/
│   ├── container.ts             Simple DI (manual wiring, singleton/transient)
│   └── modules/app.module.ts    Composition root
├── domain/
│   ├── Server.ts                MCPServer — root entity: config, state machine, health, serialization
│   ├── ServerStatus.ts          enum + ServerConfig/State/Health interfaces
│   ├── Transport.ts             ServerTransport interface (isReady, healthCheck, sendRequest)
│   └── demo.ts                  State transition demo
├── application/
│   ├── EventBus.ts              EventEmitter wrapper
│   ├── HealthChecker.ts         Periodic tools/list probe
│   ├── PortAllocator.ts         Port reservation (auto LIFO, manual, collision detect)
│   ├── ProcessManager.ts        Spawn/kill supergateway child processes
│   └── adapters.ts              Legacy <-> domain bridge
├── infrastructure/
│   ├── config/
│   │   ├── ConfigCache.ts       TTL cache for config values
│   │   ├── ConfigDiff.ts        Field-level change detection between configs
│   │   ├── ConfigValidator.ts   Zod validate + apply with rollback
│   │   ├── ConfigWatcher.ts     chokidar watcher with debounce
│   │   └── ReloadController.ts  3 reload strategies (immediate/graceful/rolling)
│   ├── http/HttpClient.ts       fetch wrapper with retry + timeout
│   ├── metrics/
│   │   ├── metrics.ts           prom-client counters/gauges/histograms
│   │   └── middleware.ts        Express metrics middleware
│   └── transports/
│       ├── TransportFactory.ts  Creates SuperGatewayTransport or DirectStdioTransport
│       ├── SuperGatewayTransport.ts  HTTP transport for supergateway-bridged servers
│       └── DirectStdioTransport.ts   JSON-RPC over stdin/stdout — no supergateway
├── middleware/
│   ├── audit.ts                 POST audit logging
│   ├── error-handler.ts         Centralized sanitized JSON error handler
│   ├── logging.ts               Request/response debug/info log
│   ├── rate-limit.ts            In-memory RateLimiter
│   ├── request-id.ts            crypto.randomUUID + X-Request-ID header
│   └── timeout.ts               setTimeout 504 + connection destroy
```

### Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Transport | supergateway (HTTP/SSE) or DirectStdioTransport (native stdio) | Transport per server config. supergateway for remote clients (Windows, LAN, VPS); DirectStdioTransport for local servers (~0.5ms faster per request, one less process). |
| Two apps | Management (8080) + Gateway (8090) | Different auth/rate-limit policies. Management for operators, gateway for clients. |
| Domain model | MCPServer state machine | Pure domain with enforced state transitions (STOPPED→STARTING→RUNNING→STOPPING→ERROR). Testable without spawning processes. |
| DI | Manual container (70 lines) | No decorators/reflection. Avoids tsyringe/inversify dependency. |
| Legacy adapters | adapters.ts bridges two eras | Mid-migration from flat ServerState to domain MCPServer. Bridge will be removed when migration completes. |

## Pipeline

```
config.yaml
  -> chokidar watches (500ms debounce)
  -> ConfigValidator.validateAndApply()
  -> ConfigDiff.diffServerConfigs() -> added/removed/modified
  -> ReloadController.reloadServersWithStrategy()
     -> stop removed, restart modified, start added (stagger 1s)

Client request
  -> Gateway (port 8090): POST /mcp/:serverId
  -> ServerManager.getServer(id) -> check status === "running"
  -> ServerManager.proxyMCPRequest(id, body)
     -> transport.usesPort()?
        YES (supergateway): http.request -> http://127.0.0.1:<port>/mcp -> pipe response
        NO  (stdio):        transport.sendRequest(server, body) -> JSON-RPC over stdin/stdout
  -> Error -> 502/503/504

Server lifecycle
  config.servers.*.enabled !== false
  -> PortAllocator.allocate() (default: 8100+)
  -> spawn("npx -y supergateway --stdio <cmd> --outputTransport streamableHttp --port N")
  -> SuperGatewayTransport.isReady() -> polling tools/list initialize
  -> server.markRunning(port, child)
  -> HealthChecker runs periodic tools/list probe
  -> Non-zero exit -> auto-restart (5s delay)
  -> SIGTERM/SIGINT -> stopAll() -> 10s hard limit -> process.exit(0)
```

### Transport Modes

| Mode | Bridge process | Port | Latency | Use case |
|------|---------------|------|---------|----------|
| `supergateway` | supergateway HTTP→SSE→stdio | Allocated (8100+) | ~+2ms per request | Remote clients (Windows→WSL, LAN, VPS) |
| `stdio` | None — direct JSON-RPC | 0 (no port) | ~4ms local | Local ark-* servers on the same machine |

See `docs/transport-modes.md` for full latency benchmarks, serialization analysis, and migration guide.

## Key Types

```
ServerConfig { id, command[], env, timeout, port?, enabled, transport, healthCheck? }
ServerState  { status: ServerStatus, port, process?, error?, startedAt?, health? }
ServerStatus enum { STOPPED, STARTING, RUNNING, STOPPING, ERROR }

MCPServer extends EventEmitter:
  - fromRawConfig(RawConfig) -> MCPServer
  - start/stop/markRunning/markError/markStopped
  - isRunning/isStopped/isEnabled/canAcceptRequests
  - getPort/getConfiguration/getState

ServerTransport interface:
  isReady(server, timeoutMs?)    -> boolean
  healthCheck(server)            -> boolean
  sendRequest(server, request)   -> response
  getEndpoint(server)            -> string

Config (YAML):
  servers: Record<id, ServerConfig>
  auth: { tokens?: string[], enabled: boolean }
  managementPort/gatewayPort/logLevel/compression
```

## Critical Constraints

- **supergateway via npx** — ProcessManager runs `npx -y supergateway` as child process, not import. `supergateway` is a pinned dependency for offline installs; runtime also forces `npx -y` to always get latest.
- **DirectStdioTransport** — fully implemented. Servers with `transport: stdio` in config use native JSON-RPC over stdin/stdout, skipping supergateway entirely.
- **Port range 8100+** — auto ports start at 8100. Manual ports bypass allocator but tracked for conflict.
- **Health stale at 2x interval** — `canAcceptRequests()` uses 2x configured interval as staleness threshold.
- **Shutdown hard limit 10s** — after SIGTERM/SIGINT, servers get 10s then process.exit(0).
- **Gateway timeout 60s** — hardcoded in http.request options and timeout middleware.
- **No WS streaming** — roadmap item. Current SSE via polling.
- **No Dockerfile committed** — Docker/K8s docs exist but no build artifact.

## Plugin Ecosystem

Not a plugin system — this is an MCP gateway, not an OpenCode plugin. MCP servers (ark-exec, ark-memory, etc.) are configured as `servers` in config.yaml, managed as child processes via supergateway.

## Current State

- Gateway proxy via supergateway — **done**
- Management API (CRUD, health, logs SSE, bulk ops) — **done**
- Config hot-reload with field-level diff + 3 strategies — **done**
- Domain model (MCPServer state machine) — **done**
- Full middleware (auth, rate-limit, metrics, request-id, timeout) — **done**
- DI container — **done**
- CLI arg parsing — **done**
- DirectStdioTransport — **done** (5 integration tests passing)
- Gateway stdio dispatch (proxyMCPRequest) — **done** (full HTTP→stdio→child→response loop)
- Dockerfile — **not committed**
- WebSocket / OAuth2 / React UI — **roadmap**

## Recent Changes (v1.0.1 → v1.0.2-pre)

5 commits after npm v1.0.1: complete architectural refactor. Flat Express app → domain-driven layered architecture with DI, hot-reload, CLI, transport abstraction, comprehensive middleware. ~3x source code.

## Files to Edit

| File | Purpose |
|------|---------|
| `src/gateway.ts` | Proxy logic, SSE passthrough edge cases |
| `src/application/ProcessManager.ts` | Spawn args, DirectStdioTransport will change this |
| `src/infrastructure/transports/DirectStdioTransport.ts` | Edge cases: large payloads, multi-line JSON, process restart |
| `src/infrastructure/transports/SuperGatewayTransport.ts` | SSE response parsing (fragile for non-SSE) |
| `src/server_manager.ts` | Bridge pattern (legacy→domain→legacy), reduce when migration complete |
| `src/index.ts` | Growing too large — two apps + middleware + shutdown in one file |
| `src/infrastructure/config/ReloadController.ts` | No health verification after restart |

## Important Files

- `config.yaml` — runtime config (servers, auth, ports)
- `config.example.yaml` — documented example for users
- `~/node_modules/@ev3lynx/oh-my-mcp/` — globally installed copy (npm)
