# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-04

### Added
- Initial release
- Process management for MCP servers
- Config-driven server configuration (YAML)
- Management REST API (port 8080)
  - List/start/stop/restart servers
  - Health checks
  - Log streaming
  - MCP info discovery
- Gateway API (port 8090)
  - Unified endpoint `/mcp/:serverId`
  - HTTP proxy to supergateway children
- Bearer token authentication
- Hot reload configuration
- Auto-restart on server crash
- Environment variable support in config
- Systemd service example
- Comprehensive documentation

### Dependencies
- express ^4.21.0
- http-proxy-middleware ^3.0.0
- yaml ^2.5.0
- zod ^3.23.0
- pino ^9.0.0
- chokidar ^3.6.0

### Built On
- [supercorp-ai/supergateway](https://github.com/supercorp-ai/supergateway) - MCP stdio to HTTP bridge

---

## [Unreleased]

### Planned
- Web UI dashboard
- Metrics/prometheus export
- OAuth2 authentication
- Multiple transport support (SSE, WebSocket)
- Server groups
- Rate limiting per server
- Request logging
