# Universal Agent Protocol: oh-my-mcp

`oh-my-mcp` is a **standalone, universal agent** designed for high-performance management of [Model Context Protocol](https://github.com/modelcontextprotocol/spec) servers. It is capable of functioning as a dedicated, managed MCP-server or as a unified controller for multiple existing MCP servers.

## 🤖 AI-to-AI / Agent-to-Agent Interop

This document serves as the protocol specification for other autonomous agents interacting with `oh-my-mcp`.

### 1. Communication Protocol

- **Gateway Protocol**: JSON-RPC 2.0 over HTTP/SSE.
- **Payload Structure**: All requests to `/mcp` must follow the [MCP Specification](https://modelcontextprotocol.io).
- **Endpoint**: `http://localhost:8090/mcp`
- **Authentication**: Bearer Token in `Authorization` header.

### 2. Context Preservation

When handing off work between agents or communicating through `oh-my-mcp`:

- **Request IDs**: Always include a unique `X-Request-ID` to trace operations across the gateway and underlying MCP servers.
- **Metadata**: Pass agent-specific metadata in the JSON-RPC `meta` field to maintain lineage.

### 3. Interaction Patterns

- **Discovery**: Agents should first call `GET /servers` on the Management API (`:8080`) to discover available capabilities.
- **Health Awareness**: Check `GET /health` or `GET /servers/:id/health` before initiating long-running tasks.
- **Failover**: If a server is `stopped` or `error`, agents can attempt a `POST /servers/:id/restart` before reporting a failure.

## 🛠 Capabilities

- **Lifecycle Management**: Start, stop, and rolling-restart of MCP servers.
- **Unified Proxying**: Consolidates multiple Stdios/transports into a single HTTP/SSE stream.
- **Observability**: Prometheus metrics (`/metrics`) and structured JSON audit logs for state changes.
- **Resilience**: Zod-validated hot-reloading of configuration without gateway downtime.

## 📡 Interface Reference

| Component | Endpoint | Protocol | Description |
|-----------|----------|----------|-------------|
| **Management** | `:8080/` | HTTP/JSON | State control, health, and server metadata. |
| **Gateway** | `:8090/mcp` | HTTP/SSE | Unified JSON-RPC proxy for all servers. |
| **Metrics** | `:8080/metrics` | Prometheus | Performance and usage telemetry. |

---

*This agent follows the Unified Agent Guidelines for autonomous collaboration.*
