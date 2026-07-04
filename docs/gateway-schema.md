# Blueprint: oh-my-mcp Gateway Schema (DRAFT v1.0.2)

This document outlines the architectural schema for `oh-my-mcp` as a specialized high-performance gateway for the Model Context Protocol (MCP).

## 1. Core Philosophy: The Proxy-First approach

`oh-my-mcp` acts as a **control plane** and **data plane** for MCP. It does not run agents itself but provides the reliable "plumbing" for external orchestrators (n8n, Openclaw, Custom SDKs).

---

## 2. Data Plane: Gateway Routing

The gateway translates standard HTTP/SSE requests into MCP JSON-RPC messages for managed servers.

### Endpoint: `/mcp/:serverId`

* **Method**: `POST`
* **Body**: Standard JSON-RPC 2.0 (MCP)
* **Headers**:
  * `Accept: text/event-stream` (Recommended for SSE streams)
  * `Authorization: Bearer <token>` (If gateway auth enabled)

### Endpoint: `/mcp` (Header-based)

* **Method**: `POST`
* **Headers**:
  * `X-MCP-Server: <serverId>`
* **Purpose**: Consistent URL for clients that handle multiplexing via headers.

---

## 3. Control Plane: Management API

Used by external tools (like an n8n custom node) to discover and manage MCP server instances.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/servers` | `GET` | Returns a list of all configured servers and their current status (`starting`, `running`, `stopped`, `error`). |
| `/servers/:id` | `GET` | Detailed status of a single server. |
| `/servers/:id/start` | `POST` | Manually trigger a server start. |
| `/servers/:id/stop` | `POST` | Trigger a graceful shutdown. |
| `/health` | `GET` | Gateway health check. |
| `/metrics` | `GET` | Prometheus-compatible metrics (Request counts, latency, process stats). |

---

## 4. Future Schema Extensions (v1.1+)

To support Option B (External Orchestration), we propose the following schema additions:

### A. Webhook Subscriptions (`/subscriptions`)

Instead of an internal CRON, `oh-my-mcp` will allow external tools to "subscribe" to MCP notifications.

* **Schema**:

    ```json
    {
      "serverId": "everything",
      "method": "notifications/resources/updated",
      "callbackUrl": "https://n8n.internal/webhook/mcp-update"
    }
    ```

### B. Dynamic Tool Inventory (`/discovery`)

A simplified endpoint for n8n/Openclaw to quickly ingest all available tools across ALL running servers in one response.

* **Endpoint**: `/discovery/tools`
* **Response**: A merged JSON object of all tool schemas available via the gateway.

### C. Protocol Bridging: WebSocket Gateway

To support highly interactive agents without HTTP overhead, adding `/mcp/ws` for full-duplex JSON-RPC communication.

---

## 5. Internal System Schema

The internal state of `oh-my-mcp` is governed by a strict domain model and Zod-validated configuration.

### A. Configuration Schema (Zod)

The system configuration (`config.yaml`) follows this internal structure:

```typescript
{
  managementPort: number; // default: 8080
  gatewayPort: number;    // default: 8090
  logLevel: "debug" | "info" | "warn" | "error";
  compression: boolean;   // Enable Gzip
  auth?: {
    token?: string;       // Single global token
    tokens?: string[];    // Multiple allowed tokens
  };
  servers: Record<string, ServerConfig>;
}
```

### B. Server Instance Schema (`ServerConfig`)

Each MCP server entry defines its execution and maintenance rules:

```typescript
{
  command: string[];      // Executable and arguments
  env?: Record<string, string>;
  timeout?: number;       // Startup timeout (ms)
  port?: number;          // Static port (optional)
  enabled: boolean;
  transport: "supergateway" | "stdio";
  healthCheck?: {
    interval: number;     // Frequency of pings
    timeout: number;      // Max wait for health response
    unhealthyThreshold: number; // Retries before marking ERROR
  };
}
```

### C. Internal State Machine

Servers transition through these states, visible in the `/servers` API:

1. **STOPPED**: Initial state, process is not active.
2. **STARTING**: Process spawned, waiting for transport readiness.
3. **RUNNING**: Transport ready, passing health checks.
4. **STOPPING**: Graceful shutdown in progress.
5. **ERROR**: Process crashed or failed health checks beyond threshold.

---

## 6. Integration Blueprints

* **n8n**: A community node uses `/servers` to populate a dropdown, and `/mcp/:serverId` to execute the selected tool.
* **Openclaw**: Uses `oh-my-mcp` as a "Remote Tool Source," fetching capability schemas via the `/mcp/:serverId` (initialize request).
