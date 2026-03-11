# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Zod Schema Adoption**: Added validation for CLI arguments (`--help`, `--port`, etc.) and API routes (Server ID, query params).
- **Hot Reload System**: Implemented config watching with `chokidar`, debounced reloading, smart diff detection, and graceful rolling restart strategies.
- **Gateway**: Added proxying for MCP JSON-RPC over HTTP and JSON-RPC over SSE (`text/event-stream`).
- **Management API**: Features for server control (start/stop/restart), health checks, and server listing.
- **Infrastructure**: Introduced `MCPServer` state machine, `ProcessManager`, `PortAllocator`, and comprehensive middleware support (logging, rate-limiting, metrics, audit).
- **Observability**: Prometheus metrics export (`/metrics`) and structured JSON logging.
- **Documentation**: Extensive guides for architecture, observability, deployment (Docker, Kubernetes), and API reference.

### Fixed

- **ProcessManager**: Resolved issue with spawn argument splitting/concatenation.
- **Gateway**: Improved HTTP compliance by filtering hop-by-hop headers.
- **CI/CD**: Fixed lint error handling in GitHub Actions.

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
