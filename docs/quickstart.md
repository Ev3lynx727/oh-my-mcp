# Quick Start Guide

Get oh-my-mcp running in 5 minutes.

## Step 1: Install

```bash
git clone https://github.com/your-org/oh-my-mcp.git
cd oh-my-mcp
npm install
```

## Step 2: Create Configuration

Create a minimal `config.yaml`:

```yaml
managementPort: 8080
gatewayPort: 8090
logLevel: info

auth:
  tokens:
    - "my-secret-token"

servers:
  memory:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-memory"
    timeout: 60000
    enabled: true
```

## Step 3: Start

```bash
npm run dev
```

You should see:
```
Loading config from: ./config.yaml
Config loaded
Starting oh-my-mcp
Management API listening on port 8080
Gateway API listening on port 8090
Auto-starting server: memory
Server memory started successfully
```

## Step 4: Verify

### Check Server Status

```bash
curl -H "Authorization: Bearer my-secret-token" http://localhost:8080/servers
```

Response:
```json
{
  "servers": [
    {
      "id": "memory",
      "name": "memory",
      "status": "running",
      "port": 8100,
      "startedAt": "2026-03-04T10:00:00.000Z"
    }
  ]
}
```

### Check Health

```bash
curl -H "Authorization: Bearer my-secret-token" http://localhost:8080/servers/memory/health
```

### Test MCP Gateway

```bash
curl -X POST \
  -H "Authorization: Bearer my-secret-token" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://localhost:8090/mcp/memory
```

## Step 5: Add More Servers

Edit `config.yaml` to add more servers:

```yaml
servers:
  memory:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-memory"
    enabled: true

  github:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "{env:GITHUB_TOKEN}"
    enabled: true

  filesystem:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "/home/ev3lynx"
    enabled: true
```

The new servers will be automatically started!

## Common Operations

### Start a Server
```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/github/start
```

### Stop a Server
```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/github/stop
```

### Restart a Server
```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/github/restart
```

### View Logs
```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/github/logs
```

### Get MCP Server Info
```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/github/info
```

## Next Steps

- Read the [Configuration Guide](./configuration.md) for more options
- Read the [API Reference](./api-reference.md) for complete endpoint documentation
- Set up [systemd deployment](./deployment-systemd.md) for production
