# API Reference

Complete reference for oh-my-mcp REST API.

## Base URLs

- **Management API**: `http://localhost:8080`
- **Gateway API**: `http://localhost:8090`

## Authentication

All endpoints (except `/health` and `/`) require Bearer token authentication.

Include the token in the `Authorization` header:

```
Authorization: Bearer YOUR_TOKEN
```

## Management API Endpoints

### Health Check

```
GET /health
```

Returns the health status of the oh-my-mcp service.

**Response:**
```json
{
  "status": "ok",
  "servers": 3
}
```

---

### List Servers

```
GET /servers
```

Returns a list of all configured and running servers.

**Response:**
```json
{
  "servers": [
    {
      "id": "memory",
      "name": "memory",
      "status": "running",
      "port": 8100,
      "startedAt": "2026-03-04T10:00:00.000Z",
      "config": {
        "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],
        "timeout": 60000,
        "enabled": true
      }
    }
  ]
}
```

---

### Get Server Details

```
GET /servers/:id
```

Returns details about a specific server.

**Parameters:**
- `id` - Server identifier

**Response:**
```json
{
  "id": "memory",
  "name": "memory",
  "status": "running",
  "port": 8100,
  "startedAt": "2026-03-04T10:00:00.000Z",
  "health": {
    "ok": true,
    "lastCheck": "2026-03-04T10:05:00.000Z"
  },
  "config": {
    "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],
    "timeout": 60000,
    "enabled": true
  }
}
```

---

### Start Server

```
POST /servers/:id/start
```

Starts a configured server.

**Parameters:**
- `id` - Server identifier

**Response:**
```json
{
  "id": "memory",
  "status": "running"
}
```

---

### Stop Server

```
POST /servers/:id/stop
```

Stops a running server.

**Parameters:**
- `id` - Server identifier

**Response:**
```json
{
  "id": "memory",
  "status": "stopped"
}
```

---

### Restart Server

```
POST /servers/:id/restart
```

Restarts a server (stops then starts).

**Parameters:**
- `id` - Server identifier

**Response:**
```json
{
  "id": "memory",
  "status": "running"
}
```

---

### Get Server Logs

```
GET /servers/:id/logs
```

Streams logs from a server process.

**Parameters:**
- `id` - Server identifier

**Response:** Server-Sent Events (SSE) stream of log messages.

---

### Server Health Check

```
GET /servers/:id/health
```

Performs a health check on a running server.

**Parameters:**
- `id` - Server identifier

**Response:**
```json
{
  "id": "memory",
  "healthy": true,
  "lastCheck": "2026-03-04T10:05:00.000Z"
}
```

---

### Get Server MCP Info

```
GET /servers/:id/info
```

Returns MCP capabilities (tools, resources, prompts) from a running server.

**Parameters:**
- `id` - Server identifier

**Response:**
```json
{
  "tools": [
    {
      "name": "create_memory",
      "description": "Create a new memory",
      "inputSchema": {
        "type": "object",
        "properties": {
          "memory": { "type": "string" }
        }
      }
    }
  ],
  "resources": [],
  "prompts": []
}
```

---

### Start All Servers

```
POST /servers/_start-all
```

Starts all configured servers that have `enabled: true`.

**Response:**
```json
{
  "results": [
    { "id": "memory", "status": "running" },
    { "id": "github", "status": "running" },
    { "id": "filesystem", "status": "error", "error": "Failed to start" }
  ]
}
```

---

### Stop All Servers

```
POST /servers/_stop-all
```

Stops all running servers.

**Response:**
```json
{
  "status": "stopped"
}
```

---

## Gateway API Endpoints

### MCP Proxy

```
POST /mcp/:serverId
```

Proxies MCP requests to the specified server.

**Parameters:**
- `serverId` - Server identifier (in URL path)

**Headers:**
- `Authorization` - Bearer token (required)
- `Content-Type` - application/json
- `Accept` - application/json, text/event-stream

**Request Body:** JSON-RPC 2.0 MCP request

**Example:**
```bash
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://localhost:8090/mcp/memory
```

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "Missing server ID. Use /mcp/:serverId or X-MCP-Server header"
}
```

### 401 Unauthorized

```json
{
  "error": "Unauthorized"
}
```

### 404 Not Found

```json
{
  "error": "Server 'github' not found"
}
```

### 503 Service Unavailable

```json
{
  "error": "Server 'github' is not running (status: stopped)"
}
```
