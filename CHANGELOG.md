# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [1.1.0] - 2026-07-04

### Added

- **Config reload health verification**: ReloadController now verifies server health after every start/restart with 3 retries/500ms in all strategies (immediate/graceful/rolling). (#11)
- **Request/response caching**: In-memory TTL cache for idempotent MCP methods (`tools/list`, `resources/list`, `prompts/list`) with per-server `cacheTtl` config (default 60s). (#12)
- **Auth system**: Bearer token authentication with auto-generated token via `auth.autoGenerate` (64-char hex persisted to `~/.config/oh-my-mcp/auth-token`). Auth boundary verified — 401 without token, 200 with valid token.
- **CLIENT_TAG isolation**: `ark-exec` supports per-client log/cache directory isolation via `CLIENT_TAG` env var, enabling concurrent WSL + Windows clients without state collision.
- **DirectStdioTransport**: Native MCP stdio transport with JSON-RPC over stdin/stdout, removing supergateway dependency for local servers.
- **Gateway stdio dispatch**: `proxyMCPRequest` routes `POST /mcp/:serverId` to the appropriate transport (DirectStdio or SuperGateway), with 501 fallback for SSE-only servers.
- **Runtime server registration**: `POST /servers/:id` API and runtime persistence across restarts.
- **Config hot-reload**: Smart diff detection, ConfigWatcher (chokidar), ConfigValidator, and 3-strategy restart (immediate/graceful/rolling).
- **Hono integrated**: Replaced http-proxy-middleware to fix 18+ CVEs.
- **SSE reconnection fix**: supergateway patch moves MCP.Server initialization per-connection, preventing crash on client reconnect.

### Fixed

- **8 pre-existing test failures**: SuperGatewayTransport mock mismatch, ProcessManager stale spawn expectation, integration test assertion errors. Full pass: 27 files, 177 tests.
- **Lint**: Unnecessary semicolon, unused imports cleaned.
- **GitHub Actions CI**: Added develop branch triggers, strict lint step, npm audit enforcement.
- **Security audit**: `npm audit fix --force` resolved 5 vulnerabilities (2 moderate, 1 high, 2 critical) across esbuild/vite/vitest.

### Changed

- **Deps**: Removed `http-proxy-middleware`, `nanoid` (dead deps). Added `hono`, `supergateway` as explicit dependency. Bumped `yaml` ^2.5.0→^2.9.0, `vitest`/`@vitest/coverage` ^1.6.0→^4.1.9.
- **Docs**: All 29 markdown files audited and migrated to current dev stage. Deleted 5 stale files (AGENT.md, deployment-*.md, observation.md). Added service-management-commands.md, transport-modes.md, gateway-schema.md, BACKLOG.md, CE.md.

---

## [1.0.1] - 2026-03-11

### Added

- **Gateway**: Support for proxying MCP JSON-RPC over HTTP to backend servers.
- **Management API**: Tools for starting, stopping, and restarting servers, plus health checks and server lists.
- **Transports**: Introduced `SuperGatewayTransport` abstraction.
- **Observability**: Prometheus metrics (`/metrics`), structured JSON logging, and audit logging for state-changing operations.
- **Performance & Security**: Implemented per-IP rate limiting, gzip compression, and configurable timeouts.
- **Configuration**: YAML support with Zod validation and hot-reload capabilities.
- **Documentation**: New Docker and Kubernetes deployment guides.
- **Testing**: Added a comprehensive suite of unit and integration tests.

### Infrastructure

- **Domain layer**: Introduced `MCPServer` state machine.
- **Application layer**: Developed `ProcessManager`, `PortAllocator`, `EventBus`, and `HealthChecker`.
- **Infrastructure layer**: Added `HttpClient`, `ConfigCache`, and `TransportFactory`.
- **Middleware**: Integrated request-id, error-handler, timeout, rate-limit, audit, logging, metrics, and compression.

## [1.0.0] – 2026-03-11

Initial release of oh-my-mcp. Provides basic MCP server management and HTTP gateway.

[1.1.0]: https://github.com/Ev3lynx727/oh-my-mcp/releases/tag/v1.1.0
[1.0.1]: https://github.com/Ev3lynx727/oh-my-mcp/releases/tag/v1.0.1
[1.0.0]: https://github.com/Ev3lynx727/oh-my-mcp/releases/tag/v1.0.0
