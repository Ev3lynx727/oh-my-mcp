# oh-my-mcp

Native MCP gateway with management layer on top of supergateway.

Built by [ev3lynx727](https://github.com/Ev3lynx727)

## Features

- **Process Management**: Start/stop/restart MCP servers with auto-restart on crash
- **Config-driven**: Define servers in YAML/JSON, hot-reload on changes
- **Unified Gateway**: Single endpoint `/mcp/:serverId` to access all servers
- **Health Monitoring**: Automatic health checks for all running servers
- **Tool Discovery**: Auto-discover tools, resources, prompts from running servers
- **Auth**: Bearer token authentication
- **Logs**: Stream logs from running servers

## Quick Start

```bash
# Install dependencies
npm install

# Copy config example
cp config.example.yaml config.yaml

# Edit config.yaml with your settings
# - Set your auth token
# - Configure servers

# Start the gateway
npm run dev
```

## API

### Management API (port 8080)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/servers` | List all servers |
| GET | `/servers/:id` | Get server details |
| POST | `/servers/:id/start` | Start a server |
| POST | `/servers/:id/stop` | Stop a server |
| POST | `/servers/:id/restart` | Restart a server |
| GET | `/servers/:id/logs` | Stream server logs |
| GET | `/servers/:id/health` | Check server health |
| GET | `/servers/:id/info` | Get MCP tools/resources |
| POST | `/servers/_start-all` | Start all configured servers |
| POST | `/servers/_stop-all` | Stop all servers |

### Gateway API (port 8090)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/mcp/:serverId` | Proxy MCP request to server |

## Config

```yaml
managementPort: 8080
gatewayPort: 8090
logLevel: info

auth:
  tokens:
    - "your-secret-token"

servers:
  github:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "{env:GITHUB_TOKEN}"
    timeout: 60000
    enabled: true
```

## Using with systemd

```ini
# /etc/systemd/system/oh-my-mcp.service
[Unit]
Description=oh-my-mcp - Native MCP Gateway
After=network.target

[Service]
Type=simple
User=ev3lynx
WorkingDirectory=/home/ev3lynx/Project/oh-my-mcp
ExecStart=/usr/bin/npm run start -- /home/ev3lynx/Project/oh-my-mcp/config.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Client Configuration

```json
{
  "mcpServers": {
    "oh-my-mcp": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "-H", "Authorization: Bearer YOUR_TOKEN",
        "-H", "Content-Type: application/json",
        "-d", "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}",
        "http://localhost:8090/mcp/github"
      ]
    }
  }
}
```

## Environment Variables

In config, use `{env:VAR_NAME}` to reference environment variables:

```yaml
env:
  GITHUB_TOKEN: "{env:GITHUB_TOKEN}"
```

This will be replaced with the actual value from `process.env`.
