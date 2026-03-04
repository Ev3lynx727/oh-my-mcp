# Usage Guide - oh-my-mcp

Comprehensive examples and patterns for using `oh-my-mcp` to manage MCP servers.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Running the Gateway](#running-the-gateway)
- [Using with MCP Clients](#using-with-mcp-clients)
- [API Examples](#api-examples)
- [Docker Deployment](#docker-deployment)
- [Kubernetes](#kubernetes)
- [OpenClaw Integration](#openclaw-integration)
- [CI/CD](#cicd)
- [Troubleshooting](#troubleshooting)

---

## Installation

### From npm (recommended)

```bash
npm install -g @ev3lynx/oh-my-mcp
```

### From source

```bash
git clone https://github.com/Ev3lynx727/oh-my-mcp.git
cd oh-my-mcp
npm ci
npm run build
```

---

## Quick Start

1. **Create a configuration file** (`config.yaml`):

```yaml
managementPort: 8080
gatewayPort: 8090
logLevel: info

servers:
  # Example: GitHub MCP server
  github:
    command: ["npx", "-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: "${GH_TOKEN}"
    transport: "supergateway"
    enabled: true
    healthCheck:
      interval: 30000
      timeout: 5000
      unhealthyThreshold: 3
```

2. **Set environment variable**:

```bash
export GH_TOKEN="your_github_token_here"
```

3. **Run the gateway**:

```bash
# If installed globally
oh-my-mcp config.yaml

# Or from source
node dist/index.js config.yaml
```

4. **Test it**:

```bash
# Health check
curl http://localhost:8080/health

# List servers
curl http://localhost:8080/servers

# Proxy a request (see API Examples below)
```

---

## Configuration

### Full Example

`config.yaml`:

```yaml
# Server ports
managementPort: 8080    # Management API (auth required)
gatewayPort: 8090      # MCP JSON-RPC proxy (auth required)

# Logging
logLevel: info         # debug, info, warn, error
compression: true      # Enable gzip compression

# Authentication (optional but recommended)
auth:
  enabled: true
  tokens:
    - "your-secret-token-1"
    - "another-token"

# MCP servers
servers:
  # Server 1: GitHub MCP
  github:
    command: ["npx", "-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: "${GH_TOKEN}"
    timeout: 60000
    enabled: true
    transport: "supergateway"
    healthCheck:
      interval: 30000
      timeout: 5000
      unhealthyThreshold: 3

  # Server 2: Filesystem MCP
  filesystem:
    command: ["npx", "-y", "@modelcontextprotocol/server-filesystem"]
    env:
      ALLOWED_PATHS: "/home/user/projects"
    transport: "supergateway"
    enabled: true
    port: 8101  # Optional: fixed port

  # Server 3: Custom script (stdio transport coming soon)
  custom:
    command: ["./custom-server", "--port", "0"]
    transport: "supergateway"
    enabled: false  # Disabled by default
```

### Environment Variable Substitution

Oh-my-mcp supports `${VAR}` syntax in config values. Variables are resolved from the process environment.

```yaml
servers:
  github:
    env:
      GITHUB_TOKEN: "${GH_TOKEN}"     # From env
      API_KEY: "${MY_API_KEY:-default}"  # With fallback
```

### Configuration Validation

The config is validated with Zod on load. Invalid configs produce clear error messages:

```bash
Error: Invalid config: servers.github.timeout must be a number
```

---

## Running the Gateway

### As a standalone process

```bash
# With config file
oh-my-mcp config.yaml

# With custom ports via CLI (overrides config)
oh-my-mcp config.yaml --management-port 9000 --gateway-port 9001

# With environment variables
 MANAGEMENT_PORT=9000 GATEWAY_PORT=9001 oh-my-mcp config.yaml

# In background (Linux/macOS)
nohup oh-my-mcp config.yaml > /var/log/oh-my-mcp.log 2>&1 &
```

### With systemd

Create `/etc/systemd/system/oh-my-mcp.service`:

```ini
[Unit]
Description=oh-my-mcp Gateway
After=network.target

[Service]
Type=simple
User=ohmy
WorkingDirectory=/opt/oh-my-mcp
Environment="GH_TOKEN=your_token"
ExecStart=/usr/bin/oh-my-mcp /opt/oh-my-mcp/config.yaml
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable oh-my-mcp
sudo systemctl start oh-my-mcp
sudo systemctl status oh-my-mcp
```

### With OpenClaw cron

```bash
openclaw cron schedule \
  --interval "daily at 9am" \
  --script "oh-my-mcp" \
  --args "/path/to/config.yaml"
```

### With Docker

See [Docker Deployment](#docker-deployment) below.

---

## Using with MCP Clients

oh-my-mcp acts as a ** proxy** for MCP servers. You configure your MCP client (Claude Desktop, Cursor, etc.) to point to the gateway instead of individual servers.

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "http",
      "url": "http://localhost:8090/mcp",
      "headers": {
        "Server-Id": "github",
        "Authorization": "Bearer your-secret-token"
      }
    },
    "filesystem": {
      "command": "http",
      "url": "http://localhost:8090/mcp",
      "headers": {
        "Server-Id": "filesystem"
      }
    }
  }
}
```

### Cursor

Similar JSON config. Consult Cursor docs for exact location.

### Windsurf / Other Clients

Any client that supports HTTP-based MCP (custom `http` transport) can use oh-my-mcp.

---

## API Examples

### Base URLs

- **Management API**: `http://localhost:8080`
- **Gateway API**: `http://localhost:8090`

---

### Management API

#### Health Check

```bash
curl http://localhost:8080/health
# Response: { "status": "ok", "servers": 2 }
```

#### List All Servers

```bash
curl -H "Authorization: Bearer your-token" \
  http://localhost:8080/servers
```

Response:

```json
[
  {
    "id": "github",
    "name": "GitHub MCP",
    "status": "running",
    "port": 8100,
    "error": null,
    "health": { "ok": true, "lastCheck": "2026-03-04T12:00:00.000Z" },
    "startedAt": "2026-03-04T11:59:00.000Z"
  }
]
```

#### Get Single Server

```bash
curl -H "Authorization: Bearer your-token" \
  http://localhost:8080/servers/github
```

#### Start Server

```bash
curl -X POST -H "Authorization: Bearer your-token" \
  http://localhost:8080/servers/github/start
```

#### Stop Server

```bash
curl -X POST -H "Authorization: Bearer your-token" \
  http://localhost:8080/servers/github/stop
```

#### Restart Server

```bash
curl -X POST -H "Authorization: Bearer your-token" \
  http://localhost:8080/servers/github/restart
```

#### Start All Servers

```bash
curl -X POST -H "Authorization: Bearer your-token" \
  http://localhost:8080/_start-all
```

#### Stop All Servers

```bash
curl -X POST -H "Authorization: Bearer your-token" \
  http://localhost:8080/_stop-all
```

#### Prometheus Metrics

```bash
curl http://localhost:8080/metrics
```

Example metrics:

```
# HELP ohmy_mcp_servers_total Total number of servers by status
# TYPE ohmy_mcp_servers_total gauge
ohmy_mcp_servers_total{status="running"} 2
ohmy_mcp_servers_total{status="stopped"} 1
```

---

### Gateway API (MCP JSON-RPC Proxy)

#### Initialize

```bash
curl -X POST http://localhost:8090/mcp \
  -H "Server-Id: github" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "test-client", "version": "1.0.0" }
    }
  }'
```

#### List Tools

```bash
curl -X POST http://localhost:8090/mcp \
  -H "Server-Id: github" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

#### Call Tool

```bash
curl -X POST http://localhost:8090/mcp \
  -H "Server-Id: github" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "tool": "search_repositories",
      "arguments": { "query": "openclaw" }
    }
  }'
```

---

## Docker Deployment

### Build Image

```bash
docker build -t oh-my-mcp:latest .
```

### Run

```bash
# Create config
cp config.example.yaml config.yaml
# Edit config.yaml with your servers and tokens

# Run container
docker run -d \
  --name oh-my-mcp \
  -p 8080:8080 \
  -p 8090:8090 \
  -v $(pwd)/config.yaml:/app/config.yaml \
  -e GH_TOKEN="your_github_token" \
  oh-my-mcp:latest
```

### Docker Compose

`docker-compose.yml`:

```yaml
version: '3.8'
services:
  oh-my-mcp:
    image: oh-my-mcp:latest
    container_name: oh-my-mcp
    ports:
      - "8080:8080"
      - "8090:8090"
    volumes:
      - ./config.yaml:/app/config.yaml
      - ./logs:/app/logs
    environment:
      - GH_TOKEN=${GH_TOKEN}
      - NODE_ENV=production
    restart: unless-stopped
```

---

## Kubernetes

### Deployment

`deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oh-my-mcp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: oh-my-mcp
  template:
    metadata:
      labels:
        app: oh-my-mcp
    spec:
      containers:
        - name: oh-my-mcp
          image: oh-my-mcp:latest
          ports:
            - containerPort: 8080
              name: management
            - containerPort: 8090
              name: gateway
          env:
            - name: GH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: oh-my-mcp-secrets
                  key: gh-token
          volumeMounts:
            - name: config
              mountPath: /app/config.yaml
              subPath: config.yaml
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: config
          configMap:
            name: oh-my-mcp-config
```

### Service

`service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: oh-my-mcp
spec:
  selector:
    app: oh-my-mcp
  ports:
    - name: management
      port: 8080
      targetPort: 8080
    - name: gateway
      port: 8090
      targetPort: 8090
  type: ClusterIP
```

### ConfigMap

`configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: oh-my-mcp-config
data:
  config.yaml: |
    managementPort: 8080
    gatewayPort: 8090
    logLevel: info
    servers:
      github:
        command: ["npx", "-y", "@modelcontextprotocol/server-github"]
        env:
          GH_TOKEN: "${GH_TOKEN}"
        transport: "supergateway"
        enabled: true
```

### Secret

```bash
kubectl create secret generic oh-my-mcp-secrets \
  --from-literal=gh-token='your_github_token'
```

### Deploy

```bash
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

---

## OpenClaw Integration

oh-my-mcp is designed to work seamlessly with OpenClaw.

### Start as a Managed Service

```bash
openclaw services add oh-my-mcp \
  --script "oh-my-mcp" \
  --args "/path/to/config.yaml" \
  --restart on-failure
```

### Schedule Restarts

```bash
openclaw cron schedule \
  --interval "daily at 3am" \
  --script "curl" \
  --args "-X POST http://localhost:8080/_restart-all"
```

### Monitor with OpenClaw Alerts

```bash
# Add to HEARTBEAT.md
- Check oh-my-mcp health every 30 min
  curl -s http://localhost:8080/health | jq .status
  If not "ok", send notification
```

---

## CI/CD

### GitHub Actions Example

Run tests on push:

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run build
```

### Publish to npm

(Already configured in this repo's `.github/workflows/npm-publish.yml`)

---

## Troubleshooting

### "Config file not found"

Make sure the config path is correct and the file exists. Use absolute path:

```bash
oh-my-mcp /home/user/oh-my-mcp/config.yaml
```

### Port already in use

Change `managementPort` and `gatewayPort` in config.yaml to free ports.

### Server fails to start

Check logs:

```bash
# If running with systemd
journalctl -u oh-my-mcp -f

# If running manually
# Check stdout/stderr
```

Enable debug logging:

```yaml
logLevel: debug
```

### Authentication errors

- Verify token in `Authorization: Bearer <token>` header matches one in config
- Check `auth.enabled` is `true` if you require auth
- For testing, disable auth temporarily:

```yaml
auth:
  enabled: false
```

### Health checks failing

- Increase `healthCheck.timeout` if server is slow to start
- Check the server command works outside of oh-my-mcp
- Use `debug` log level to see health check details

### "Server already running"

oh-my-mcp prevents duplicate server IDs. Ensure each server in your config has a unique `id` (the key under `servers:`).

---

## Advanced Patterns

### Hot-Reload Config

oh-my-mcp watches the config file for changes and reloads automatically. Edit `config.yaml` and save; changes are applied within 1 second.

> **Note**: Adding new servers requires a restart; modifying existing servers hot-reloads.

### Rate Limiting

Gateway has per-IP rate limiting (default: 100 req/min). Configure in code or via future config option.

### Custom Transports

Want to add a new transport (e.g., WebSocket)? Implement the `Transport` interface in `src/domain/Transport.ts` and register in `TransportFactory`.

---

## Need Help?

- **Issues**: https://github.com/Ev3lynx727/oh-my-mcp/issues
- **MCP Spec**: https://github.com/modelcontextprotocol/spec
- **supergateway**: https://github.com/supercorp-ai/supergateway
