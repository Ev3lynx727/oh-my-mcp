# Architecture

This document describes the architecture of oh-my-mcp.

## Overview

oh-my-mcp is a native MCP gateway that provides a management layer on top of supergateway. It enables centralized management of multiple MCP servers while exposing them through a unified gateway endpoint.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      oh-my-mcp                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │   Config    │  │   Server    │  │     Auth        │   │
│  │   Loader    │  │   Manager   │  │   Middleware    │   │
│  └─────────────┘  └─────────────┘  └─────────────────┘   │
│         │                │                    │              │
│  ┌──────┴────────────────┴────────────────────┴──────────┐ │
│  │                   Express Server                       │ │
│  │  ┌─────────────────────┐  ┌────────────────────────┐  │ │
│  │  │  Management API    │  │    Gateway API         │  │ │
│  │  │   (port 8080)      │  │    (port 8090)         │  │ │
│  │  └─────────────────────┘  └────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
              │                              │
    ┌─────────┴─────────┐          ┌────────┴────────┐
    │   supergateway    │          │   supergateway   │
    │   child :8100    │          │   child :8101    │
    │   (memory)       │          │   (github)       │
    └───────────────────┘          └──────────────────┘
```

## Components

### 1. Config Loader

Responsible for loading and watching the configuration file.

- Loads YAML/JSON configuration
- Watches for file changes (hot reload)
- Resolves environment variables
- Validates configuration against schema

**File:** `src/config_loader.ts`

### 2. Server Manager

Manages the lifecycle of MCP server processes.

- Spawns supergateway child processes (delegated to ProcessManager)
- Monitors server health (using domain MCPServer model)
- Handles automatic restart on failure
- Manages port allocation
- Streams logs

**Internal structure**:
- Uses a domain model `MCPServer` to encapsulate state and business rules
- Delegates OS process lifecycle to `ProcessManager`
- Maintains backward-compatible API for other components

**Files**: 
- `src/server_manager.ts` (coordinator)
- `src/application/ProcessManager.ts` (process lifecycle)
- `src/domain/Server.ts` (domain entity)

**Note**: As of 2026-03-04, the ServerManager has been refactored to use a domain model and separate ProcessManager for improved testability and separation of concerns.

### 3. Auth Middleware

Provides bearer token authentication.

- Validates Authorization header
- Supports single or multiple tokens
- Protects all management and gateway endpoints

**File:** `src/auth.ts`

### 4. Management API

REST API for server management.

- CRUD operations for servers
- Start/stop/restart operations
- Health checks
- Log streaming
- MCP info discovery

**File:** `src/api.ts`

### 5. Gateway API

MCP request proxy.

- Routes requests to appropriate server
- Path-based server selection (`/mcp/:serverId`)
- HTTP proxy to supergateway children

**File:** `src/gateway.ts`

## Data Flow

### Server Startup

1. Config is loaded from YAML file
2. For each enabled server in config:
   a. ServerManager creates/loads an `MCPServer` domain entity
   b. Delegates to `ProcessManager.startServer()` to spawn the child process
   c. ProcessManager runs: `npx supergateway --stdio "<command>" --outputTransport streamableHttp`
   d. ServerManager waits for the server to become ready (HTTP health check)
   e. Domain `MCPServer` is marked as "running" (via `markRunning()`)

### MCP Request Flow

1. Client sends MCP request to gateway: `POST /mcp/memory`
2. Auth middleware validates Bearer token
3. Gateway extracts server ID from path (`memory`)
4. Gateway proxies request to `http://localhost:8100/mcp`
5. supergateway forwards request to the MCP stdio process
6. Response flows back through the proxy

### Health Check Flow

1. Client requests health: `GET /servers/memory/health`
2. ServerManager sends MCP `tools/list` request to supergateway
3. If response is successful, server is healthy
4. Returns health status with last check timestamp

## Port Allocation

- **Management API**: Default 8080 (configurable)
- **Gateway API**: Default 8090 (configurable)
- **MCP Server Ports**: Start at 8100, auto-increment

Each MCP server gets its own port on the local machine where supergateway listens.

## Process Model

```
oh-my-mcp (parent)
  ├── Express (management :8080)
  ├── Express (gateway :8090)
  ├── supergateway :8100 (stdio → streamableHttp)
  │   └── npx @modelcontextprotocol/server-memory
  ├── supergateway :8101 (stdio → streamableHttp)
  │   └── npx @modelcontextprotocol/server-github
  └── supergateway :8102 (stdio → streamableHttp)
      └── npx @modelcontextprotocol/server-filesystem /home/ev3lynx
```

Each supergateway child:
- Runs in its own process
- Bridges stdio-based MCP server to HTTP
- Is isolated from other servers

## Configuration Hot Reload

When the config file changes:

1. File watcher detects change
2. New configuration is loaded
3. Compute the set of servers that **should be running** (enabled in new config)
4. **Stop** any currently running servers that are no longer enabled or have been removed
5. **Start** any newly added or re-enabled servers
6. Existing enabled servers continue running (no restart)

This prevents orphaned processes and keeps the running set in sync with the config.

To fully reload everything (including clearing internal state), restart the oh-my-mcp process.

## Security

- **Authentication**: Bearer token required for all endpoints
- **Process Isolation**: Each MCP server runs in separate process
- **Environment Variables**: Secrets resolved at runtime, not stored in config
- **No Root Access**: Runs as non-root user in production

## Error Handling

- **Server startup failure**: Error logged, server marked as "error"
- **Process crash**: Auto-restart after 5 seconds
- **Health check failure**: Marked as unhealthy, can trigger restart
- **Proxy error**: Returns 502 Bad Gateway

## Logging

Uses Pino for structured logging:

- JSON output
- Configurable log levels
- Includes server ID, port, error messages
- Timestamps on every log line
