# Integrations

Guide to integrating oh-my-mcp with various clients and tools.

## Overview

oh-my-mcp exposes MCP servers through a standard HTTP gateway. This allows integration with various AI clients and tools that support MCP.

## OpenCode

### Configuration

Add to your `opencode.jsonc`:

```jsonc
{
  "mcp": {
    "oh-my-mcp": {
      "type": "remote",
      "url": "http://localhost:8090/mcp/github",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      },
      "enabled": true
    }
  }
}
```

### Multiple Servers

For each MCP server you want to use:

```jsonc
{
  "mcp": {
    "oh-my-mcp-github": {
      "type": "remote",
      "url": "http://localhost:8090/mcp/github",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    },
    "oh-my-mcp-memory": {
      "type": "remote", 
      "url": "http://localhost:8090/mcp/memory",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

## Claude Desktop

### Using with SSE → stdio Bridge

Create a wrapper script `mcp-gateway`:

```bash
#!/bin/bash
exec npx -y supergateway \
  --sse "http://localhost:8090/mcp/$1" \
  --oauth2Bearer "$2"
```

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "oh-my-mcp-github": {
      "command": "mcp-gateway",
      "args": ["github", "YOUR_TOKEN"]
    },
    "oh-my-mcp-memory": {
      "command": "mcp-gateway", 
      "args": ["memory", "YOUR_TOKEN"]
    }
  }
}
```

### Direct Remote Configuration

Some MCP clients support remote servers directly:

```json
{
  "mcpServers": {
    "oh-my-mcp": {
      "url": "http://localhost:8090/mcp"
    }
  }
}
```

## Cursor

Same configuration as Claude Desktop. See above.

## VS Code

### Using MCP Extension

1. Install an MCP client extension (e.g., "MCP Client" or "Continue")
2. Configure the extension to connect to your gateway

Example for Continue extension (`~/.continue/config.json`):

```json
{
  "models": [
    {
      "model": "claude-3-opus",
      "provider": "anthropic"
    }
  ],
  "mcpServers": {
    "memory": {
      "url": "http://localhost:8090/mcp/memory",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

## Curl

### List Tools

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://localhost:8090/mcp/memory
```

### Call a Tool

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_memory",
      "arguments": {"memory": "Hello World"}
    }
  }' \
  http://localhost:8090/mcp/memory
```

### Get Resources

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/list","params":{}}' \
  http://localhost:8090/mcp/filesystem
```

## Node.js

### Using @modelcontextprotocol/client

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const client = new Client(
    {
      name: "my-app",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:8090/mcp/memory"),
    {
      headers: {
        Authorization: "Bearer YOUR_TOKEN",
      },
    }
  );

  await client.connect(transport);

  const tools = await client.request(
    { method: "tools/list" },
    { }
  );

  console.log("Tools:", tools);

  await client.close();
}

main();
```

### Using Fetch Directly

```javascript
async function callMCPTool(serverId, method, params) {
  const response = await fetch(`http://localhost:8090/mcp/${serverId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer YOUR_TOKEN",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  return response.json();
}

// List tools
const tools = await callMCPTool("memory", "tools/list", {});

// Call a tool
const result = await callMCPTool("memory", "tools/call", {
  name: "create_memory",
  arguments: { memory: "Test" },
});
```

## Python

### Using Requests

```python
import requests
import json

TOKEN = "YOUR_TOKEN"
BASE_URL = "http://localhost:8090/mcp"

def mcp_request(server_id, method, params=None):
    response = requests.post(
        f"{BASE_URL}/{server_id}",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {},
        },
    )
    return response.json()

# List tools
tools = mcp_request("memory", "tools/list")
print(tools)

# Call a tool
result = mcp_request("memory", "tools/call", {
    "name": "create_memory",
    "arguments": {"memory": "Hello"}
})
print(result)
```

## HTTP Client (Postman, Insomnia)

### Create Request

1. **Method**: POST
2. **URL**: `http://localhost:8090/mcp/memory`
3. **Headers**:
   - `Authorization`: `Bearer YOUR_TOKEN`
   - `Content-Type`: `application/json`
   - `Accept`: `application/json, text/event-stream`
4. **Body** (JSON):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

### Save as Collection

Save different requests for each server and method:

- `oh-my-mcp / memory / tools/list`
- `oh-my-mcp / github / tools/call`
- etc.

## Custom AI Integration

### Example: Simple CLI Tool

```bash
#!/bin/bash
# mcp-tool SERVER METHOD [PARAMS]

SERVER=$1
METHOD=$2
PARAMS=$3
TOKEN=${OH_MY_MCP_TOKEN:-YOUR_TOKEN}

curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$METHOD\",\"params\":$PARAMS}" \
  "http://localhost:8090/mcp/$SERVER"
```

Usage:

```bash
export OH_MY_MCP_TOKEN=your_token

# List tools
./mcp-tool memory tools/list '{}'

# Call tool
./mcp-tool memory tools/call '{"name":"create_memory","arguments":{"memory":"test"}}'
```

## Reverse Proxy (Nginx)

### Basic Setup

```nginx
server {
    listen 443 ssl;
    server_name mcp.example.com;

    ssl_certificate /etc/ssl/certs/mcp.crt;
    ssl_certificate_key /etc/ssl/private/mcp.key;

    location / {
        proxy_pass http://localhost:8090;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Required for SSE
        proxy_set_header Accept $http_accept;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

### With Authentication

```nginx
server {
    listen 443 ssl;
    server_name mcp.example.com;

    ssl_certificate /etc/ssl/certs/mcp.crt;
    ssl_certificate_key /etc/ssl/private/mcp.key;

    # Validate token at nginx level
    location / {
        auth_basic "MCP Gateway";
        auth_basic_user_file /etc/nginx/.htpasswd;
        
        proxy_pass http://localhost:8090;
        proxy_http_version 1.1;
    }
}
```

Generate password:

```bash
htpasswd -bc /etc/nginx/.htpasswd user password
```

## Docker

### Running Behind Docker

If oh-my-mcp is in Docker:

```json
{
  "mcp": {
    "oh-my-mcp": {
      "type": "remote",
      "url": "http://docker-host:8090/mcp/memory",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

Replace `docker-host` with your Docker host IP or hostname.
