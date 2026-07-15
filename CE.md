# CE: oh-my-mcp (@ev3lynx/oh-my-mcp) — Context Engineer Handoff

## Identity

**Bare-metal first.** All backends (ark-*, MCP servers) run on WSL as systemd user services. Zero cloud dependencies. External clients (Windows OpenCode, Claude Desktop, Cursor, Windsurf) connect via streamableHttp (stateful MCP over HTTP).

MCP Host (M0) + HTTP gateway + process manager. Single endpoint (`POST /mcp/server`) aggregates tools/list across all backends with session tracking. Legacy per-server proxy (`POST /mcp/:serverId`) preserved for backward compatibility. Spawns stdio MCP servers via supergateway (stateful streamableHttp) or DirectStdioTransport (native JSON-RPC over stdin/stdout). For Claude Desktop, Cursor, Windsurf sharing the same MCP server pool.

`@ev3lynx/oh-my-mcp` v1.2.0 — MIT, TypeScript, Node >=18.

## Client connectivity

Three access tiers. All MCP traffic is **streamableHttp** (stateful, `Mcp-Session-Id`) — SSE mode was removed in v1.1.0.

```
Windows OpenCode/Cursor/Claude Desktop  (runs on WINDOWS, not WSL)
  │  NOTE: Windows `localhost` ≠ WSL2. Use the WSL IP (e.g. 172.27.57.189,
  │        from `wsl hostname -I`; rotates on reboot) OR open the Windows
  │        firewall for the vEthernet adapter. A client running INSIDE WSL
  │        uses `localhost` normally.
  │
  │  LIVE PORT: managementPort is 8081 (not default 8080). Windows MiniTool
  │  MTAgentService held 0.0.0.0:8080, so WSL skipped the 8080 forward mapping.
  │  Moved daemon to 8081 so WSL forwards it. 8080 is dead on this host.

  ├─ HTTP → http://<host>:8081/mcp/server → oh-my-mcp MCP Host → all backends
  │         (initialize, tools/list, tools/call — session-tracked via Mcp-Session-Id)
  │         Requires mcpHost.enabled: true + Bearer auth.
  │
  ├─ HTTP → http://<host>:8101/mcp → supergateway child → ark-exec   (direct, no Host)
  ├─ HTTP → http://<host>:8102/mcp → supergateway child → ark-memory
  ├─ HTTP → http://<host>:8103/mcp → supergateway child → ark-resolve
  ├─ ... 8104 mempalace, 8105 ark-gist, 8106 ark-delegator, 8107 cleancode
  │         No auth (bypasses gateway auth layer). Works when mcpHost disabled.

oh-my-mcp in WSL
  ├─ port 8081: Management API (GET /servers, POST /servers/:id/start, etc.)
  │             + POST /mcp/server — M0 MCP Host (when mcpHost.enabled: true)
  │             (default config.example.yaml says 8080; live deployment uses 8081)
  ├─ port 8090: Legacy gateway (deprecated)
  │             POST /mcp/:serverId → proxies stdio servers; returns 501 for
  │             supergateway servers (points client to the MCP Host on 8081).
  └─ port 8101-8107: supergateway children (streamableHttp stateful) — direct per-server /mcp
```

## Architecture

```
src/
├── index.ts                     Bootstrap: 2 Express apps, middleware chains, hot-reload, shutdown
├── config.ts                    Zod schemas (ConfigSchema, ServerConfigSchema, McpHostConfigSchema)
├── config_loader.ts             YAML/JSON loading, chokidar watcher, reload + rollback
├── logger.ts                    pino singleton
├── auth.ts                      Bearer token middleware (single or multi-token)
├── gateway.ts                   Gateway router: POST /mcp/:serverId -> proxyMCPRequest (legacy)
├── server_manager.ts            ServerManager: lifecycle orchestrator + getTransport(id)
├── api.ts                       Management API + McpHost router mount
├── api/schemas.ts               Zod validation for API params/query
├── cli/schemas.ts               CLI arg parsing (Zod), showHelp, showVersion
├── di/
│   ├── container.ts             Simple DI (manual wiring, singleton/transient)
│   └── modules/app.module.ts    Composition root
├── domain/
│   ├── Server.ts                MCPServer — root entity: config, state machine, health, serialization
│   ├── ServerStatus.ts          enum + ServerConfig/State/Health interfaces
│   ├── Transport.ts             ServerTransport interface (isReady, healthCheck, sendRequest)
│   ├── BackendClient.ts         BackendClient interface + SimpleBackendClient (M0)
│   └── demo.ts                  State transition demo
├── application/
│   ├── EventBus.ts              EventEmitter wrapper
│   ├── HealthChecker.ts         Periodic tools/list probe
│   ├── PortAllocator.ts         Port reservation (auto LIFO, manual, collision detect)
│   ├── ProcessManager.ts        Spawn/kill supergateway child processes
│   ├── ToolCatalog.ts           Global tool catalog — aggregated tools/list with namespacing (M0)
│   ├── SessionManager.ts        Mcp-Session-Id lifecycle — TTL expiry, background cleanup (M0)
│   └── adapters.ts              Legacy <-> domain bridge
├── infrastructure/
│   ├── config/
│   │   ├── ConfigCache.ts       TTL cache for config values
│   │   ├── ConfigDiff.ts        Field-level change detection between configs
│   │   ├── ConfigValidator.ts   Zod validate + apply with rollback
│   │   ├── ConfigWatcher.ts     chokidar watcher with debounce
│   │   └── ReloadController.ts  3 reload strategies (immediate/graceful/rolling)
│   ├── http/HttpClient.ts       fetch wrapper with retry + timeout
│   ├── mcp-host/
│   │   └── McpHost.ts           POST /mcp/server — initialize, tools/list, tools/call (M0)
│   ├── metrics/
│   │   ├── metrics.ts           prom-client counters/gauges/histograms
│   │   └── middleware.ts        Express metrics middleware
│       └── transports/
│           ├── TransportFactory.ts  Creates SuperGatewayTransport or DirectStdioTransport
│           ├── SuperGatewayTransport.ts  HTTP transport for supergateway-bridged servers
│           ├── DirectStdioTransport.ts   JSON-RPC over stdin/stdout — no supergateway
│           └── RemoteClient.ts          Native HTTP MCP client — replaces mcp-remote-bridge.sh (M1)
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
| MCP Host | `POST /mcp/server` single endpoint (M0) | Client sends one initialize → gets all tools across all backends. Host handles routing internally. Session-tracked via Mcp-Session-Id. |
| Transport | supergateway (streamableHttp stateful) or DirectStdioTransport (native stdio) | Transport per server config. supergateway for remote clients (session-persistent child via `Mcp-Session-Id`); DirectStdioTransport for local servers (~4ms, one less process). |
| Two apps | Management (8081 live / 8080 default) + Gateway (8090) | Gateway (8090) proxies **stdio** transport servers (ark-*) via JSON-RPC over stdin/stdout. Supergateway-mode servers are NOT proxied by the gateway — it returns 501 pointing to the MCP Host on 8081. Supergateway children are reached directly on 8101-8107 (`/mcp`). |
| Domain model | MCPServer state machine | Pure domain with enforced state transitions (STOPPED→STARTING→RUNNING→STOPPING→ERROR). Testable without spawning processes. |
| DI | Manual container (70 lines) | No decorators/reflection. Avoids tsyringe/inversify dependency. |
| Legacy adapters | adapters.ts bridges two eras | Mid-migration from flat ServerState to domain MCPServer. Deferred — works, tested, no behavioral benefit to removing. |
| Tool namespacing | `{serverId}__{toolName}` | Prevents name collisions across backends. Client receives one merged list. Route table built from catalog on initialize. |

## Pipeline

```
config.yaml
  -> chokidar watches (500ms debounce)
  -> ConfigValidator.validateAndApply()
  -> ConfigDiff.diffServerConfigs() -> added/removed/modified
  -> ReloadController.reloadServersWithStrategy()
     -> stop removed, restart modified, start added (stagger 1s)

MCP Host flow (M0 — POST /mcp/server)
  -> Client: POST /mcp/server { jsonrpc, method: "initialize", ... }
  -> McpHost: fan-out initialize to all running backends via SimpleBackendClient
  -> McpHost: create Session { id, backends, timeout }
  -> Response: { result: { serverInfo, capabilities }, headers: { Mcp-Session-Id } }

  -> Client: POST /mcp/server { jsonrpc, method: "tools/list" } + Mcp-Session-Id
  -> McpHost: get session, ToolCatalog.getAllTools(backends)
  -> Response: { result: { tools: [{ name: "ark-exec__echo", ... }] } }

  -> Client: POST /mcp/server { jsonrpc, method: "tools/call", params: { name: "ark-exec__echo" } }
  -> McpHost: ToolCatalog.getTool("ark-exec__echo") -> route by serverId
  -> SimpleBackendClient.sendRequest({ name: "echo", ... }) to ark-exec
  -> Response: { result: { content: [{ text: "hello" }] } }

Legacy proxy flow (POST /mcp/:serverId — backward-compatible)
  -> Gateway: POST /mcp/:serverId
  -> ServerManager.getServer(id) -> check status === "running"
  -> ServerManager.proxyMCPRequest(id, body)
     -> transport.usesPort()?
        YES (supergateway): http.request -> http://127.0.0.1:<port>/mcp -> pipe response
        NO  (stdio):        transport.sendRequest(server, body) -> JSON-RPC over stdin/stdout
  -> Error -> 502/503/504

Server lifecycle
  config.servers.*.enabled !== false
  -> PortAllocator.allocate() (default: 8100+)
  -> spawn("node", ["<path>/supergateway/dist/index.js", "--stdio", "<cmd>", "--outputTransport", "streamableHttp", "--stateful", "--sessionTimeout", "<ms>"])
  -> SuperGatewayTransport.isReady() -> polling tools/list initialize
  -> server.markRunning(port, child)
  -> HealthChecker runs periodic tools/list probe
  -> Non-zero exit -> auto-restart (5s delay)
  -> SIGTERM/SIGINT -> stopAll() -> 10s hard limit -> process.exit(0)
```

### Transport Modes

| Mode | Bridge process | Port | Latency | Use case |
|------|---------------|------|---------|----------|
| `supergateway` | supergateway stdio→streamableHttp (stateful) | Allocated (8100+) | ~+2ms per request | Remote clients (Windows→WSL, LAN, VPS); direct `/mcp` per server on 8101-8107 |
| `stdio` | None — direct JSON-RPC | 0 (no port) | ~4ms local | Local ark-* servers on the same machine |
| `remote` | None — raw fetch to cloud URL | None | ~1-2ms local + cloud latency | Cloud MCP APIs (context7, exa) — replaces mcp-remote-bridge |

See `docs/transport-modes.md` for full latency benchmarks, serialization analysis, and migration guide.

## Key Types

```
ServerConfig { id, command[], env, timeout, port?, enabled, transport, cacheTtl?, healthCheck?, sessionTimeout? }
ServerState  { status: ServerStatus, port, process?, error?, startedAt?, health? }
ServerStatus enum { STOPPED, STARTING, RUNNING, STOPPING, ERROR }

MCPServer extends EventEmitter:
  - fromRawConfig(RawConfig) -> MCPServer
  - start/stop/markRunning/markError/markStopped
  - isRunning/isStopped/isEnabled/canAcceptRequests
  - getPort/getConfiguration/getState/getTransport

ServerTransport interface:
  isReady(server, timeoutMs?)    -> boolean
  healthCheck(server)            -> boolean
  sendRequest(server, request)   -> response
  getEndpoint(server)            -> string

BackendClient interface:          (M0)
  serverId: string
  sendRequest(request)            -> JSON-RPC response
  isHealthy()                     -> boolean
  close()                         -> void

ToolCatalog:                      (M0)
  getAllTools(backends)            -> AggregatedTool[]
  getTool(toolName)               -> { tool, serverId, backendClient }
  invalidate()                    -> force refresh
  isDegraded()                    -> true if any backend failed

SessionManager:                   (M0)
  createSession(id, backends, timeoutMs?)
  getSession(id)                  -> McpSessionContext | undefined
  deleteSession(id)               -> boolean
  destroy()                       -> cleanup intervals

McpSessionContext:                (M0)
  { id, backends: Map<string, BackendClient>, createdAt, lastActive, timeoutMs }

RemoteClient:                     (M1)
  BackendClient impl using raw fetch
  Config: { serverId, url, headers?, timeout? }
  Supports {env:VAR} header interpolation
  skip supergateway entirely — direct POST to remote MCP endpoint

Config (YAML):
  servers: Record<id, ServerConfig>
  mcpHost: { enabled, sessionTimeout?, toolCatalogTtl? }
  auth: { tokens?: string[], enabled: boolean, autoGenerate?: boolean }
  managementPort/gatewayPort/logLevel/compression
```

## Critical Constraints

- **MCP Host (M0)** — `POST /mcp/server` is the new single endpoint. Tool names are namespaced as `{serverId}__{toolName}` to prevent collisions. Client receives one merged tools/list. Route table built from ToolCatalog on initialize. Legacy `POST /mcp/:serverId` preserved for backward compatibility (deprecated).
- **supergateway via node** — ProcessManager spawns `node <path>/supergateway/dist/index.js` from the installed package. Uses local `node_modules/` path resolved via `import.meta.url`. Pinned dependency in package.json.
- **DirectStdioTransport** — fully implemented. Servers with `transport: stdio` in config use native JSON-RPC over stdin/stdout, skipping supergateway entirely.
- **Port range 8100+** — auto ports start at 8100. Manual ports bypass allocator but tracked for conflict.
- **Health stale at 2x interval** — `canAcceptRequests()` uses 2x configured interval as staleness threshold.
- **Shutdown hard limit 10s** — after SIGTERM/SIGINT, servers get 10s then process.exit(0).
- **Gateway timeout 60s** — hardcoded in http.request options and timeout middleware.
- **Cache TTL 60s default** — `proxyMCPRequest` caches `tools/list`, `resources/list`, `prompts/list` responses by server id. Per-server `cacheTtl` in config.yaml. Evicted on server stop/restart. Cache partitioned by server id only — not by request arguments (list methods are argument-free).
- **Stateful sessions** — supergateway runs with `--outputTransport streamableHttp --stateful`. Child process persists per `Mcp-Session-Id`, eliminating per-request spawn overhead and ~32ms SSE→MCP conversion. Session timeout via `sessionTimeout` config.
- **supergateway children expose `/mcp`** — each supergateway child listens on its own port (8101-8107) and serves streamableHttp at `/mcp`. There is NO `/sse` endpoint (SSE mode was removed in v1.1.0). Direct client connection: `http://<host>:8101/mcp`. No auth (bypasses the gateway auth layer).
- **8090 legacy gateway returns 501 for supergateway** — `POST /mcp/:serverId` proxies only `stdio` servers. For `supergateway` servers it returns 501 pointing the client to the MCP Host on 8081 (live) / 8080 (default). This is by design (the gateway is stateless and cannot own the streamableHttp session lifecycle). Use 8081 `/mcp/server` (Host) or 810x `/mcp` (direct) instead.
- **ToolCatalog TTL 60s** — tools/list across all backends refreshed every 60s. Force-refresh on any client call. Degraded mode if a backend is unreachable (partial catalog served).
- **Session TTL 300s default** — sessions expire after 5 min idle. Background cleanup runs every 30s. Client must send Mcp-Session-Id header on every request after initialize.
- **No WS streaming** — roadmap item.
- **No Dockerfile committed** — Docker/K8s docs exist but no build artifact.

## Plugin Ecosystem

Not a plugin system — this is an MCP gateway, not an OpenCode plugin. MCP servers (ark-exec, ark-memory, etc.) are configured as `servers` in config.yaml, managed as child processes via supergateway.

## Current State

- MCP Host core (POST /mcp/server) — **done** (M0: 218 tests pass across suite)
  - BackendClient interface + SimpleBackendClient — done
  - ToolCatalog: aggregated tools/list with serverId__ namespacing, 60s TTL — done
  - SessionManager: Mcp-Session-Id lifecycle, TTL expiry, background cleanup — done
  - McpHost router: initialize fan-out, tools/list, tools/call routing — done
- Gateway proxy via supergateway — **done**
- Management API (CRUD, health, logs SSE, bulk ops) — **done**
- Config hot-reload with field-level diff + 3 strategies — **done**
- Domain model (MCPServer state machine) — **done**
- Full middleware (auth, rate-limit, metrics, request-id, timeout) — **done**
- DI container — **done**
- CLI arg parsing — **done**
- DirectStdioTransport — **done** (5 integration tests passing)
- Runtime server registration (POST/DELETE /servers/:id) — **done** (persists across restarts)
- Gateway stdio dispatch (proxyMCPRequest) — **done** (full HTTP→stdio→child→response loop)
- Request/response caching (tools/list, resources/list, prompts/list) — **done** (in-memory TTL, per-server cacheTtl)
- Auth auto-generate — **done** (64-char hex token persisted to ~/.config/oh-my-mcp/auth-token, survive restarts)
- Per-client log/cache isolation (CLIENT_TAG) — **done** (ark-exec partitioned by wsl/windows/unknown)
- Dockerfile — **not committed**
- WebSocket / OAuth2 / React UI — **roadmap**
- M1: Native remote backends via RemoteClient — **done** (replaces mcp-remote-bridge.sh; context7/exa on `transport: remote`)
- M2: Resource/prompt aggregation — **planned**
- M3: Health/notify — **planned**

## Audit Trail (2026-07-04)

Deprecated items identified and resolved:

| # | Item | Verdict | Action |
|:-:|------|---------|--------|
| 1 | Gateway port 8090 | **KEPT** — proxies stdio transport for ark-* servers | Updated docs to clarify role |
| 2 | Legacy adapters | **DEFERRED** — works, 101 test lines pass, no behavioral gain from removing | Updated status in Design Decisions |
| 3 | Dead config (memory/filesystem/sqlite/web-search) | **REMOVED** — template leftovers, `enabled: true` wasting resources | Deleted from config.yaml |
| 4 | mempalace not in config | **SKIPPED** — runs standalone, add when managed lifecycle needed | — |
| 5 | supergateway SSE patch | **ALREADY WIRED** — `postinstall` + `patches/supergateway+3.4.3.patch` automates re-application | Updated patch docs |

## Recent Changes (v1.1.1 → v1.2.0)

| Commit | Feature | Files |
|--------|---------|-------|
| ae09dd9 | Stateful supergateway — streamableHttp with Mcp-Session-Id, sessionTimeout | config.ts, ProcessManager.ts, SuperGatewayTransport.ts, HttpClient.ts, adapters.ts |
| 8cdb4f7 | **M0 MCP Host core** — POST /mcp/server, BackendClient, ToolCatalog, SessionManager, McpHost router | BackendClient.ts, ToolCatalog.ts, SessionManager.ts, McpHost.ts, config.ts, api.ts, server_manager.ts |
| a2a4f62 | **M1 Native remote transport** — RemoteClient (raw fetch), config type: remote, delete mcp-remote-bridge | RemoteClient.ts, RemoteClient.test.ts, api.ts, server_manager.ts, ProcessManager.ts, ConfigDiff.ts, config.yaml |

31 test files, 218 tests pass (M1: 11 RemoteClient tests added; M0 supergateway SSE-framing fix updated 2 transport assertions + added 1).

## Files to Edit

| File | Purpose |
|------|---------|
| `src/gateway.ts` | Legacy proxy logic (deprecated, backward-compatible) |
| `src/infrastructure/mcp-host/McpHost.ts` | MCP Host router (M0, primary endpoint) |
| `src/application/ToolCatalog.ts` | Global tool catalog (M0, core aggregation) |
| `src/application/SessionManager.ts` | Session lifecycle (M0, TTL management) |
| `src/domain/BackendClient.ts` | Backend abstraction (M0, new backend integration) |
| `src/server_manager.ts` | Bridge pattern (legacy→domain→legacy), reduce when migration complete |
| `src/index.ts` | Growing too large — two apps + middleware + shutdown in one file |

## Important Files

- `config.yaml` — runtime config (servers, auth, ports)
- `config.example.yaml` — documented example for users
- `~/node_modules/@ev3lynx/oh-my-mcp/` — globally installed copy (npm)
- `node_modules/supergateway/dist/gateways/stdioToSse.js` — patched locally for SSE reconnection (see Patches)

## Patches

### supergateway SSE reconnection

**File**: `node_modules/supergateway/dist/gateways/stdioToSse.js`

**Problem**: One `Server` instance shared across all SSE connections. SDK's `Server.connect()` only accepts one transport — second connection crashes with `Already connected to a transport`.

**Fix** (2-line change): Removed `const server = new Server(...)` from module scope, inserted inside the GET/sse handler (`const sseServer = new Server(...)`) before `await sseServer.connect(sseTransport)`.

**Persistence**: `patches/supergateway+3.4.3.patch` applied via `"postinstall": "patch -p1 < patches/supergateway+3.4.3.patch"` in package.json. Survives `npm install`.
