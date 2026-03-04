# Server Management

Guide to managing MCP servers in oh-my-mcp.

## Overview

oh-my-mcp manages MCP servers by spawning supergateway processes. Each server runs in its own isolated process, bridged to HTTP via supergateway.

## Server States

A server can be in one of these states:

| State | Description |
|-------|-------------|
| `stopped` | Server is not running |
| `starting` | Server process is being started |
| `running` | Server is healthy and responding |
| `error` | Server failed to start or crashed |

## Starting Servers

### Auto-start on Boot

Servers with `enabled: true` in config start automatically when oh-my-mcp starts:

```yaml
servers:
  memory:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-memory"
    enabled: true  # Starts automatically
```

### Manual Start

```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/memory/start
```

### Start All Servers

```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/_start-all
```

## Stopping Servers

### Manual Stop

```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/memory/stop
```

### Stop All Servers

```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/_stop-all
```

## Restarting Servers

```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/memory/restart
```

This stops the server and starts it again.

## Monitoring

### Check Server Status

```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers
```

### Health Check

```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/memory/health
```

Response:

```json
{
  "id": "memory",
  "healthy": true,
  "lastCheck": "2026-03-04T10:05:00.000Z"
}
```

### View Logs

```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/memory/logs
```

This returns an SSE stream of logs.

### Get MCP Info

```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/memory/info
```

Returns tools, resources, and prompts available on the server.

## Auto-Restart

If a server process crashes, oh-my-mcp automatically attempts to restart it after 5 seconds.

Check for crash logs:

```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/memory/logs
```

## Port Assignment

Each server gets a unique port:

- First server: 8100
- Second server: 8101
- Third server: 8102
- etc.

Or specify a fixed port in config:

```yaml
servers:
  memory:
    command: ["npx", "-y", "@modelcontextprotocol/server-memory"]
    port: 8200  # Fixed port
```

## Environment Variables

Pass environment variables to servers:

```yaml
servers:
  github:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "{env:GITHUB_TOKEN}"
      OTHER_VAR: "static-value"
```

## Timeout Configuration

Set health check timeout:

```yaml
servers:
  memory:
    command: ["npx", "-y", "@modelcontextprotocol/server-memory"]
    timeout: 30000  # 30 seconds
```

## Disabling Servers

Set `enabled: false` to prevent auto-start:

```yaml
servers:
  memory:
    command: ["npx", "-y", "@modelcontextprotocol/server-memory"]
    enabled: false
```

The server config remains but won't start automatically.
