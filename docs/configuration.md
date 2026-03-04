# Configuration Guide

This guide explains all configuration options in oh-my-mcp.

## Configuration File Format

oh-my-mcp supports YAML configuration files. The default configuration file is `config.yaml` in the project root.

## Configuration Schema

### Top-Level Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `managementPort` | number | 8080 | Port for the management API |
| `gatewayPort` | number | 8090 | Port for the MCP gateway |
| `logLevel` | string | "info" | Logging level (debug, info, warn, error) |

### Authentication

```yaml
auth:
  # Single token
  token: "your-secret-token"
  
  # Or multiple tokens
  tokens:
    - "token-1"
    - "token-2"
```

| Option | Type | Description |
|--------|------|-------------|
| `auth.token` | string | Single bearer token |
| `auth.tokens` | array | Multiple bearer tokens |

### Server Configuration

```yaml
servers:
  server-name:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-memory"
    env:
      SOME_VAR: "value"
      SECRET: "{env:SECRET_NAME}"
    timeout: 60000
    port: 8100
    enabled: true
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `command` | array | required | Command to run (passed to npx) |
| `env` | object | {} | Environment variables |
| `timeout` | number | 60000 | Health check timeout in ms |
| `port` | number | auto | Fixed port (optional) |
| `enabled` | boolean | true | Whether to auto-start |

## Environment Variables in Config

Use `{env:VARIABLE_NAME}` syntax to reference environment variables:

```yaml
servers:
  github:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "{env:GITHUB_TOKEN}"
```

This will replace `{env:GITHUB_TOKEN}` with the value of the `GITHUB_TOKEN` environment variable at runtime.

## Example Configuration

```yaml
# oh-my-mcp configuration
managementPort: 8080
gatewayPort: 8090
logLevel: info

# Authentication - use your own token!
auth:
  tokens:
    - "zn5azlpglew393uh57mj70ez6b7cmgft0251nxm6pxs7y02f1y"

# MCP Servers
servers:
  # Local npx-based server
  memory:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-memory"
    timeout: 60000
    enabled: true

  # Server with environment variables
  github:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "{env:GITHUB_TOKEN}"
    timeout: 60000
    enabled: true

  # Server with custom path
  filesystem:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "/home/ev3lynx"
    timeout: 60000
    enabled: true

  # uvx-based server
  fetch:
    command:
      - "uvx"
      - "mcp-server-fetch"
    timeout: 60000
    enabled: true

  # Server with local wheel
  ruff:
    command:
      - "uvx"
      - "--from"
      - "/path/to/mcp-ruff"
      - "ruff-mcp-server"
    timeout: 60000
    enabled: true
```

## Hot Reload

oh-my-mcp watches the configuration file for changes. When you modify `config.yaml`:

1. The new configuration is loaded
2. Any new servers (not already running) are automatically started
3. Existing servers continue running

To trigger a full restart, restart the oh-my-mcp process itself.

## Importing from opencode.jsonc

If you're migrating from opencode's `opencode.jsonc`, convert each MCP server entry:

**From opencode.jsonc:**
```json
{
  "mcp": {
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "environment": { "GITHUB_TOKEN": "{env:GITHUB_TOKEN}" }
    }
  }
}
```

**To config.yaml:**
```yaml
servers:
  github:
    command:
      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_TOKEN: "{env:GITHUB_TOKEN}"
```

## Troubleshooting

### Server Won't Start

Check the logs:
```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/server-name/logs
```

### Port Already in Use

Change the port in your configuration:
```yaml
managementPort: 8081
gatewayPort: 8091
```

### Environment Variable Not Found

Make sure the environment variable is set before starting oh-my-mcp:
```bash
export GITHUB_TOKEN=your_token
npm run dev
```
