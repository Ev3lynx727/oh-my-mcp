# Service Management Commands - Design System Overview

## Executive Summary

This document provides a comprehensive overview of the Service Management Commands design system implemented in oh-my-mcp. The system manages the lifecycle of MCP (Model Context Protocol) servers through a well-architected combination of domain-driven design, event-driven communication, and RESTful management APIs. The architecture separates concerns between process management, server state management, transport handling, and API exposure, creating a maintainable and extensible system for MCP server orchestration.

## 1. Architecture Overview

### 1.1 Core Components

The Service Management system consists of four primary components that work together to provide complete lifecycle management for MCP servers. Each component has a specific responsibility and communicates with others through well-defined interfaces.

The **ServerManager** (`src/server_manager.ts`) serves as the central coordinator that orchestrates all server-related operations. It bridges the gap between the legacy configuration system and the new domain model, managing the complete lifecycle of each MCP server from startup through shutdown. The ServerManager handles port allocation, process spawning, transport creation, and event propagation, making it the primary entry point for all server operations.

The **ProcessManager** (`src/application/ProcessManager.ts`) is responsible solely for the spawning and termination of server processes. It uses Node.js child_process APIs to spawn MCP servers as separate processes, manages their stdout/stderr streams, and handles graceful shutdown through SIGTERM and SIGKILL signals. The ProcessManager maintains a registry of running processes and provides methods to check process status and retrieve process handles.

The **MCPServer Domain Model** (`src/domain/Server.ts`) encapsulates all knowledge about a single MCP server, including its immutable configuration and mutable runtime state. This domain model enforces business rules about server lifecycle transitions, implements health check logic, and emits events when state changes occur. The domain model ensures that servers can only transition between valid states and provides query methods to determine if a server can accept requests.

The **Transport Layer** (`src/infrastructure/transports/`) handles communication between the gateway and MCP servers. The TransportFactory creates appropriate transport instances based on server configuration, supporting both stdio-based communication and HTTP-based communication through supergateway.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Service Management System                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      API Layer (api.ts)                    │  │
│  │   GET/POST /servers/:id  |  /start  |  /stop  |  /restart│  │
│  └─────────────────────────────┬─────────────────────────────┘  │
│                                │                                  │
│  ┌─────────────────────────────▼─────────────────────────────┐  │
│  │                  ServerManager (server_manager.ts)         │  │
│  │  • Lifecycle orchestration                                  │  │
│  │  • Port allocation & process management                    │  │
│  │  • Event bridging (domain ↔ EventBus)                     │  │
│  └─────────────────────────────┬─────────────────────────────┘  │
│                                │                                  │
│         ┌──────────────────────┼──────────────────────┐        │
│         │                      │                      │        │
│  ┌──────▼──────┐      ┌─────────▼─────────┐    ┌──────▼──────┐  │
│  │   Process   │      │   MCPServer      │    │   Transport │  │
│  │  Manager    │      │   (Domain Model) │    │   Factory   │  │
│  │             │      │                  │    │             │  │
│  │  spawn/kill │      │  State Machine   │    │  stdio/http │  │
│  │  streams    │      │  Health Check    │    │  health     │  │
│  └─────────────┘      └──────────────────┘    └─────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Design Principles

The Service Management system follows several key design principles that guide its architecture and implementation. Understanding these principles helps developers extend and maintain the system effectively.

**Domain-Driven Design**: The MCPServer class is a proper domain entity that encapsulates both configuration (immutable) and state (mutable). It enforces business rules about valid state transitions and exposes clear interfaces for querying server capabilities. The domain model is responsible for determining whether a server can accept requests, not external controllers.

**Event-Driven Communication**: The system uses an EventBus (`src/application/EventBus.ts`) for communication between components rather than direct coupling. ServerManager subscribes to domain events from MCPServer and re-emits them through the EventBus for external consumers. This loose coupling allows new listeners to be added without modifying the server management logic.

**Separation of Concerns**: Each component has a focused responsibility. ProcessManager knows nothing about MCP protocols or configuration—它只管理进程。ServerManager coordinates but delegates specialized tasks to ProcessManager (进程管理), TransportFactory (通信), and PortAllocator (端口分配)。

**Backward Compatibility**: The system maintains a legacy adapter layer that converts between the old ServerState format and the new domain model. This allows existing code and configurations to work unchanged while new code uses the domain model.

## 2. Server Lifecycle Management

### 2.1 Lifecycle States

Each MCP server can be in one of several lifecycle states defined in `src/domain/ServerStatus.ts`. The state machine enforces valid transitions and prevents invalid operations.

```typescript
enum ServerStatus {
  STOPPED = "stopped",    // Initial state, no process running
  STARTING = "starting",  // Process spawned, waiting for ready
  RUNNING = "running",    // Healthy and accepting requests
  STOPPING = "stopping", // Graceful shutdown in progress
  ERROR = "error",       // Failure state, may auto-restart
}
```

The valid state transitions form a directed graph. A server can transition from STOPPED to STARTING when explicitly started. From STARTING, it transitions to RUNNING upon successful initialization or ERROR if initialization fails. From RUNNING, it can transition to STOPPING for graceful shutdown or ERROR if a critical failure occurs. The ERROR state may transition back to STOPPED after auto-restart attempts are exhausted or can trigger an automatic restart after a delay.

### 2.2 Startup Sequence

The server startup process follows a carefully orchestrated sequence that ensures servers are properly initialized before accepting requests. When a start request arrives, the ServerManager first checks if the server is already running to prevent duplicate startups. It then creates or retrieves the domain server object and allocates a port either from the explicit configuration or from the auto-allocation pool.

The ProcessManager spawns a new child process running the supergateway with the MCP server command. The gateway process is configured with stdio transport to communicate with the MCP server and streamable HTTP transport to expose the server to clients. Once the process is running, the ServerManager creates a transport instance and waits for the server to become ready by polling the transport's isReady method with a timeout.

Upon successful ready confirmation, the domain server transitions to RUNNING state with its allocated port and process reference. The ServerManager emits a serverStarted event through the EventBus, allowing external systems to react to the server becoming available. If any step fails, the server transitions to ERROR state, the process is terminated, and an error is thrown to the caller.

```typescript
async startServer(id: string, config: ServerConfig): Promise<void> {
  // 1. Check if already running
  const existing = this.servers.get(id);
  if (existing?.isRunning()) {
    return; // Already running
  }

  // 2. Allocate port
  const port = config.port ?? this.portAllocator.allocate();

  // 3. Spawn process via ProcessManager
  await this.processManager.startServer(server, config, port);

  // 4. Wait for ready via transport
  await this.waitForServer(id, transport, config.timeout);

  // 5. Mark as running
  server.markRunning(port, child);
  this.eventBus.emit("serverStarted", id);
}
```

### 2.3 Shutdown Sequence

Server shutdown is designed to be graceful, allowing servers to clean up resources before termination. When a stop request arrives, the ServerManager first checks if the server is actually running. If not running, it returns immediately. For running servers, it retrieves the port configuration to determine if it was auto-allocated.

The ProcessManager sends SIGTERM to the process for graceful shutdown. After a brief delay (configurable, default 2 seconds), if the process hasn't terminated, SIGKILL is sent to force termination. The transport is cleaned up and removed from the registry. If the port was auto-allocated, it is returned to the port allocator for reuse. Finally, the server state transitions to STOPPED and a serverStopped event is emitted.

### 2.4 Auto-Restart Behavior

The system implements intelligent auto-restart for servers that crash unexpectedly. When a process exits with a non-zero exit code, the ServerManager schedules a restart attempt after a 5-second delay. The restart only occurs if the server is still marked as enabled in its configuration and is not in a manually stopped state. This prevents restart loops for servers that are intentionally stopped or disabled.

## 3. Process Management

### 3.1 ProcessManager Responsibilities

The ProcessManager class is responsible exclusively for spawning and managing operating system processes. It maintains a Map of running process handles indexed by server ID and provides methods to start, stop, and query process status. This narrow focus makes the ProcessManager easy to test and maintain.

When starting a server, the ProcessManager resolves environment variables from the configuration, merging them with the current process environment. It uses npx to execute the supergateway, which in turn manages the MCP server process. The stdio command and arguments are passed through to supergateway, which handles the stdio communication with the actual MCP server.

### 3.2 Process Lifecycle

```typescript
// Starting a process
const child = spawn("npx", [
  "-y", "supergateway",
  "--stdio", stdioCmd,
  "--outputTransport", "streamableHttp",
  "--port", port.toString()
], { env: mergedEnv });

// Handling stdout/stderr
child.stdout?.on("data", (data) => {
  logger.debug({ server: id }, data.toString().trim());
});

child.stderr?.on("data", (data) => {
  logger.info({ server: id }, data.toString().trim());
});

// Handling exit
child.on("exit", (code) => {
  logger.info({ server: id, code }, "Server process exited");
  this.runningProcesses.delete(id);
});
```

### 3.3 Graceful Shutdown

The shutdown sequence demonstrates the system's commitment to graceful termination. First, SIGTERM is sent to allow the process to perform cleanup. After a 2-second grace period, if the process is still alive, SIGKILL is sent to force termination. This two-step approach balances the need for clean shutdown with the practical reality that some processes may hang during shutdown.

```typescript
async stopServer(server: MCPServer): Promise<void> {
  const child = this.runningProcesses.get(id);
  
  child.kill("SIGTERM");
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  if (!child.killed) {
    child.kill("SIGKILL");
  }
  
  this.runningProcesses.delete(id);
}
```

## 4. Port Management

### 4.1 PortAllocator

The PortAllocator class manages a pool of available ports for auto-allocated servers. It starts from a configurable base port and tracks which ports are currently in use. When a server needs a port and doesn't have one explicitly configured, the allocator finds the next available port above the base.

The allocator maintains a Set of allocated ports and provides methods to allocate, reserve (for explicit configuration), and release ports. When releasing a port, it is removed from the allocated set and becomes available for future allocations.

### 4.2 Manual vs Auto Allocation

Servers can be configured with explicit ports in their configuration, in which case the port is reserved at startup. If no explicit port is provided, the PortAllocator assigns one dynamically. This allows flexible deployment scenarios where some servers have fixed ports (useful for known API endpoints) while others use dynamic allocation (useful for scaling scenarios).

## 5. Transport Layer

### 5.1 TransportFactory

The TransportFactory creates appropriate transport instances based on server configuration. Currently, the system supports supergateway-based HTTP transport, which is the default. The transport is responsible for checking server readiness and performing health checks.

### 5.2 ServerTransport Interface

All transports implement the ServerTransport interface, which defines methods for checking readiness, performing health checks, and sending requests to the MCP server. This abstraction allows different transport implementations to be swapped without affecting the rest of the system.

```typescript
interface ServerTransport {
  isReady(server: MCPServer, timeoutMs?: number): Promise<boolean>;
  healthCheck(server: MCPServer): Promise<boolean>;
  sendRequest(server: MCPServer, request: any): Promise<any>;
}
```

## 6. Health Monitoring

### 6.1 Health Check Configuration

Servers can be configured with health check parameters that define how frequently health is verified and how many consecutive failures trigger error state.

```typescript
healthCheck: {
  interval: 30000,        // Check every 30 seconds
  timeout: 5000,          // 5 second timeout for each check
  unhealthyThreshold: 3   // Mark unhealthy after 3 failures
}
```

### 6.2 Health Status Tracking

The MCPServer domain model tracks health status and implements threshold-based error detection. Each health check result updates the internal health state, and consecutive failures are counted. When the threshold is exceeded, the server automatically transitions to ERROR state.

The canAcceptRequests method checks not just whether the server is running, but also whether it has recent healthy health check results. This prevents routing requests to servers that appear to be running but are not responding properly.

## 7. Event System

### 7.1 EventBus Integration

The EventBus provides decoupled communication between system components. ServerManager subscribes to domain events from MCPServer and re-emits them as EventBus events. External consumers can subscribe to EventBus events without the domain knowing about them.

### 7.2 Events Emitted

The system emits several events that external systems can subscribe to for monitoring and automation:

| Event | Payload | Description |
|-------|---------|-------------|
| serverStarting | serverId | Server is beginning startup |
| serverStarted | serverId | Server successfully started |
| serverStopping | serverId | Server is beginning shutdown |
| serverStopped | serverId, exitCode | Server has stopped |
| serverError | serverId, error | Server encountered an error |
| log | serverId, type, data | Log output from server process |
| healthChange | serverId, health | Health status changed |

## 8. Management API

### 8.1 REST Endpoints

The Management API exposes HTTP endpoints for server control, defined in `src/api.ts`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /servers | List all servers (running and configured) |
| GET | /servers/:id | Get server details |
| POST | /servers/:id/start | Start a server |
| POST | /servers/:id/stop | Stop a server |
| POST | /servers/:id/restart | Restart a server |
| GET | /servers/:id/logs | Stream server logs (SSE) |
| GET | /servers/:id/health | Get health status |
| GET | /servers/:id/info | Get MCP server info (tools, resources) |
| POST | /servers/_start-all | Start all configured servers |
| POST | /servers/_stop-all | Stop all running servers |

### 8.2 Response Formats

List servers response includes all running servers merged with configured but stopped servers:

```json
{
  "servers": [
    {
      "id": "github",
      "name": "github",
      "status": "running",
      "port": 8100,
      "error": null,
      "health": { "ok": true, "lastCheck": "2024-01-15T10:30:00Z" },
      "startedAt": "2024-01-15T10:29:55Z",
      "config": {
        "command": ["npx", "@modelcontextprotocol/server-github"],
        "timeout": 60000,
        "enabled": true
      }
    }
  ]
}
```

### 8.3 Server Details Response

```json
{
  "id": "github",
  "name": "github",
  "status": "running",
  "port": 8100,
  "error": null,
  "health": { "ok": true, "lastCheck": "2024-01-15T10:30:00Z" },
  "startedAt": "2024-01-15T10:29:55Z",
  "config": {
    "command": ["npx", "@modelcontextprotocol/server-github"],
    "env": {},
    "timeout": 60000,
    "port": 8100,
    "enabled": true,
    "transport": "supergateway"
  }
}
```

## 9. Configuration Schema

### 9.1 Server Configuration

Servers are configured in the YAML configuration file with the following schema:

```typescript
const ServerConfigSchema = z.object({
  command: z.array(z.string()),           // Required: [npx, @mcp/server-github]
  env: z.record(z.string()).optional(),  // Environment variables
  timeout: z.number().optional().default(60000),  // Health check timeout
  port: z.number().optional(),           // Explicit port (auto-allocated if omitted)
  enabled: z.boolean().optional().default(true),   // Auto-start on boot
  transport: z.enum(["supergateway", "stdio"]).optional().default("supergateway"),
  healthCheck: z.object({
    interval: z.number().optional().default(30000),    // Check every 30s
    timeout: z.number().optional().default(5000),      // 5s timeout
    unhealthyThreshold: z.number().optional().default(3)
  }).optional()
});
```

### 9.2 Example Configuration

```yaml
servers:
  github:
    command:
      - npx
      - -y
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_TOKEN: "{env:GITHUB_TOKEN}"
    timeout: 60000
    enabled: true
    healthCheck:
      interval: 30000
      timeout: 5000
      unhealthyThreshold: 3

  fileserver:
    command:
      - npx
      - -y
      - "@modelcontextprotocol/server-filesystem"
      - /data
    port: 8101
    enabled: true
```

## 10. Domain Model Deep Dive

### 10.1 MCPServer Class

The MCPServer class is the core domain entity that encapsulates server behavior. It maintains immutable configuration and mutable state, enforcing business rules through controlled state transitions.

Key accessors provide read-only access to server properties: id returns the unique identifier, name returns the display name, getConfiguration returns the immutable config, getStatus returns the current state, getPort returns the allocated port, getHealth returns the last health check result, and isRunning/isHealthy/canAcceptRequests provide boolean queries about server state.

### 10.2 State Transitions

The domain model enforces valid transitions through specific methods. markStarting() transitions from STOPPED to STARTING. markRunning() transitions from STARTING to RUNNING with port and process. markStopping() transitions from RUNNING to STOPPING. markStopped() transitions to STOPPED from any state. markError() transitions to ERROR with an error message.

Attempting invalid transitions throws an error, preventing corrupted state:

```typescript
markRunning(port: number, process: ChildProcess): void {
  if (this.state.status !== ServerStatus.STARTING) {
    throw new Error(`Cannot mark server ${this.id} as RUNNING from status ${this.state.status}`);
  }
  // ... perform transition
}
```

### 10.3 Request Eligibility

The canAcceptRequests() method determines if a server is eligible to receive MCP requests. A server can accept requests only if it is in RUNNING state, not in ERROR state, has a recent health check result, and the health check passed within the configured interval. This prevents routing requests to servers that appear running but are not responding properly.

## 11. Extension Points

### 11.1 Custom Transports

New transport types can be added by implementing the ServerTransport interface and registering them with the TransportFactory. This allows support for additional communication protocols as the MCP ecosystem evolves.

### 11.2 Custom Health Checks

Health check behavior can be customized by implementing the healthCheck method in custom transport implementations. The configuration schema allows specifying interval, timeout, and failure threshold parameters.

### 11.3 Event Handlers

External systems can subscribe to EventBus events for monitoring, logging, or automation. The event-driven architecture allows adding new handlers without modifying the core management logic.

## 12. Conclusion

The Service Management Commands design system in oh-my-mcp provides a robust foundation for MCP server lifecycle management. Through careful separation of concerns, domain-driven design, and event-driven communication, the system achieves maintainability while supporting complex production scenarios including auto-restart, health monitoring, graceful shutdown, and flexible port allocation.

The architecture clearly separates process management (ProcessManager), state management (MCPServer domain), orchestration (ServerManager), and exposure (REST API), with clean interfaces between each layer. This separation allows individual components to be tested in isolation, replaced with alternative implementations, or extended with new capabilities without affecting the rest of the system.

The domain model enforces business rules about valid server states and transitions, preventing invalid operations and ensuring the system remains consistent. Combined with comprehensive event emission and a full-featured management API, the system provides everything needed for reliable MCP server operations in production environments.
