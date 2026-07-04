# Backlog

## Legend

- ✅ Done
- 🟡 In Progress
- ⬜ Not Started
- 🔴 Blocked

---

## Dependency Audit — 2026-07-03

| Dependency | Type | Integration | Effect % | Files | Verdict |
|------------|------|-------------|----------|-------|---------|
| express | dep | Module | 45% | 5/11 src files | Core |
| zod | dep | Module | 27% | 3/11 src files | Core |
| pino | dep | Module | 9% | 1/11 src files | Significant |
| yaml | dep | Module | 9% | 1/11 src files | Significant |
| chokidar | dep | Module | 9% | 1/11 src files | Significant |
| prom-client | dep | Module | 9% | 1/11 src files | Significant |
| compression | dep | Module | 9% | 1/11 src files | Peripheral |
| supergateway | dep | CLI | 9% | 1/11 src files | Spawn-only, used via npx |
| http-proxy-middleware | dep | Dead | 0% | 0/11 src files | ✅ Removed |
| nanoid | dep | Dead | 0% | 0/11 src files | ✅ Removed |
| hono | dep | Added | — | — | ✅ CVE remediation (18+ vulns fixed) |
| yaml | dep | Module | ^2.5.0→^2.9.0 | 1/11 src files | ✅ Bumped |
| typescript | devDep | Module | 27% | build config | Core build tool |
| vitest | devDep | Module | — | test/ | Core test framework |
| eslint | devDep | Module | — | config | Core linter |

## Phase 1: Direct Stdio Transport (✅ Done)

| # | Item | Status | Root Cause | Why | What's the Matter | Description |
|---|------|--------|------------|-----|-------------------|-------------|
| 1 | Implement DirectStdioTransport | ✅ | Stub — all methods throw | All servers currently require supergateway; no native MCP stdio support | Every MCP server needs supergateway bridge | Implement JSON-RPC over stdio: initialize, tools/list, sendRequest via stdin/stdout |
| 2 | Merge DirectStdioTransport with ProcessManager | ✅ | ProcessManager hardcoded for supergateway spawn args | TransportFactory needs to choose supergateway vs stdio per server config | Supergateway-only deployment | Branch ProcessManager.startServer on transport type |

## Phase 2: npm Publishing (✅ Done)

| # | Item | Status | Root Cause | Why | What's the Matter | Description |
|---|------|--------|------------|-----|-------------------|-------------|
| 3 | Publish `@ev3lynx/oh-my-mcp` v1.1.0 | ✅ | npm token | Published v1.1.0 from main with auth, caching, hot-reload, health verification | All Phase 1-4 features now available on npm | Published as [`@ev3lynx/oh-my-mcp`](https://www.npmjs.com/package/@ev3lynx/oh-my-mcp) v1.1.0 — 30+ commits since v1.0.1 |
| 4 | Publish `@oh-my-mcp/ark-exec` | ⬜ | Scope not created | Clean scope for ark suite | Future scope | Deferred — scope creation + org membership needed |
| 5 | Publish `@oh-my-mcp/ark-memory` | ⬜ | Same | Same | Same | Deferred |
| 6 | Publish `@oh-my-mcp/ark-resolve` | ⬜ | Same | Same | Same | Deferred |

## Phase 3: Gateway Integration (✅ Done)

| # | Item | Status | Root Cause | Why | What's the Matter | Description |
|---|------|--------|------------|-----|-------------------|-------------|
| 7 | Register ark-* servers in oh-my-mcp config | ✅ | Done | ark-exec/ark-memory/ark-resolve/mempalace registered in config.yaml | Services accessible through single HTTP gateway endpoint | Added to prod config.yaml, 4 servers running on ports 8101-8104 |
| 8 | Cross-VM gateway for Windows MCP clients | ✅ | Done — WSL→Windows gateway operational | oh-my-mcp listens on `*:8080`; Windows clients connect via SSE through supergateway | Windows OpenCode talks to all 4 ark-* via gateway | Auth boundary (bearer token) + auto-generate + per-client CLIENT_TAG isolation |

## Phase 4: Observability & Quality (🟡 In Progress)

| # | Item | Status | Root Cause | Why | What's the Matter | Description |
|---|------|--------|------------|-----|-------------------|-------------|
| 9 | Dockerfile | ⬜ | Docs exist, no build artifact committed | Containerized deployment | Deployments require manual Node setup | Create multi-stage Dockerfile with dist/ + node_modules |
| 10 | Remove dead deps | ✅ | http-proxy-middleware and nanoid unused | Clean package.json | Dead deps = false signal for security audits | `npm uninstall http-proxy-middleware nanoid` |
| 11 | Config reload health verification | ✅ | ReloadController now verifies via healthCheck with 3 retries/500ms | Catch failed restarts quickly | Silent failures after config reload | verifyServerHealth() after every start/restart in all strategies |
| 12 | Request/response caching | ✅ | tools/list, resources/list, prompts/list hit backend every call | Idempotent list responses don't change between calls | Unnecessary round-trips to backend MCP servers | In-memory TTL cache in proxyMCPRequest; per-server cacheTtl in config.yaml (default 60s); evicts on server stop |

## Phase 5: Roadmap (⬜ Not Started)

| # | Item | Status | Root Cause | Why | What's the Matter | Description |
|---|------|--------|------------|-----|-------------------|-------------|
| 13 | WebSocket streaming | ⬜ | SSE endpoint exists, no WS | Real-time bidirectional communication | SSE unidirectional | Add WS upgrade support to gateway |
| 14 | OAuth2 / JWT auth | ⬜ | Bearer token only | Enterprise auth requirements | Token-only limits deployment scenarios | Add pluggable auth strategies |
| 15 | React management UI | ⬜ | API-only | Visual server management | CLI-only management | Build thin dashboard |

## Known Issues

| # | Issue | Impact | Workaround |
|---|-------|--------|------------|
| 1 | Gateway 60s hard timeout | Long-running MCP operations may be cut | Increase gateway timeout in config |
| 2 | Graceful shutdown 10s hard limit | Some servers may not clean up in time | Configure shorter server timeouts |

## Notes

- BACKLOG.md lives on **develop** only — never cherry-picked to main
- All statuses reflect oh-my-mcp v1.1.0 state as of 2026-07-04
- Dependency effect % = files referencing dep / total source files (40 src/ files scanned)

---

Audit run: 2026-07-03
