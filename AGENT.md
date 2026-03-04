# Agent: oh-my-mcp

oh-my-mcp is an OpenClaw agent that manages [Model Context Protocol](https://github.com/modelcontextprotocol/spec) servers and provides a unified HTTP gateway.

## Metadata

- **Name:** oh-my-mcp
- **Version:** 0.1.0
- **Author:** ev3lynx
- **Repository:** <https://github.com/ev3lynx/oh-my-mcp>
- **License:** MIT

## Capabilities

- Start, stop, restart MCP server processes (via supergateway)
- Proxy MCP JSON-RPC over HTTP (`/mcp`)
- Health checks and status reporting
- Prometheus metrics (`/metrics`)
- Rate limiting and audit logging
- Hot-reload configuration

## Interfaces

- **Management API:** `http://localhost:8080` (start/stop, server list, health)
- **Gateway API:** `http://localhost:8090/mcp` (JSON-RPC proxy)
- **Metrics:** `http://localhost:8080/metrics`

## Configuration

YAML-based (`config.yaml`). See `config.example.yaml` and documentation.

## Deployment

Supports Docker and Kubernetes. See `docs/deployment/`.

---

*This agent is intended to run as a long-lived service managed by OpenClaw.*
