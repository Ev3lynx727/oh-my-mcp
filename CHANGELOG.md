# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Gateway**: Proxy MCP JSON-RPC over HTTP to backend servers
- **Management API**: start/stop/restart servers, health checks, server list
- **Transport abstraction** with `SuperGatewayTransport`
- **Prometheus metrics** (`/metrics`) with custom and process metrics
- **Request/Response logging** with structured JSON
- **Rate limiting**: per-IP (management) and per-token (gateway)
- **Audit logging** for state-changing operations
- **Compression** (gzip) in production
- **Timeouts**: management (120s), gateway (60s)
- **Configuration** via YAML with Zod validation and hot-reload
- **Docker** and **Kubernetes** deployment guides
- **Comprehensive test suite** with unit and integration tests

### Infrastructure

- Domain layer with `MCPServer` state machine
- Application layer: `ProcessManager`, `PortAllocator`, `EventBus`, `HealthChecker`
- Infrastructure: `HttpClient`, `ConfigCache`, `TransportFactory`
- Middleware: `request-id`, `error-handler`, `timeout`, `rate-limit`, `audit`, `logging`, `metrics`, `compression`

### Documentation

- Architecture guide
- Observability guide
- Deployment guides (Docker, Kubernetes)
- Troubleshooting guide
- Upgrade guide
- API reference
- Contributing guidelines

---

## [0.1.0] – 2024-03-05

Initial release of oh-my-mcp. Provides basic MCP server management and HTTP gateway.
