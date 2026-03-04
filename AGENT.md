# AGENT.md - AI Agent Guidance

This file provides guidance for AI agents working on the oh-my-mcp project.

## Project Overview

**oh-my-mcp** is a native MCP gateway that provides a management layer on top of supergateway. It manages multiple MCP servers, exposes them through a unified gateway, and handles lifecycle (start/stop/restart), health monitoring, and authentication.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 18+
- **HTTP Server**: Express.js
- **Logging**: Pino
- **Config**: YAML with Zod validation
- **MCP Bridge**: supergateway (npx)

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main entry point, starts both APIs |
| `src/config.ts` | Type definitions and Zod schemas |
| `src/config_loader.ts` | YAML loading, hot reload |
| `src/server_manager.ts` | Process spawning, health checks |
| `src/auth.ts` | Bearer token middleware |
| `src/api.ts` | Management REST API |
| `src/gateway.ts` | MCP proxy endpoint |
| `config.yaml` | Runtime configuration |

## Commands

```bash
# Install
npm install

# Dev mode (hot reload)
npm run dev

# Build
npm run build

# Start (production)
node dist/index.js config.yaml
```

## Important Implementation Details

### Server Manager

- Each MCP server spawns a **supergateway** child process
- Command: `npx -y supergateway --stdio "<command>" --outputTransport streamableHttp --port <PORT>`
- MCP servers communicate via stdio, supergateway bridges to HTTP
- **Critical**: Requests must include `Accept: application/json, text/event-stream` header

### Port Allocation

- Management API: 8080 (configurable)
- Gateway API: 8090 (configurable)
- MCP servers: 8100+ (auto-increment)

### Authentication

- Bearer token in `Authorization` header
- Token(s) configured in `config.yaml` under `auth.tokens`
- Required for all endpoints except `/health` and `/`

### Hot Reload

- Watches `config.yaml` for changes
- Auto-starts new servers when added to config
- Does NOT restart existing servers

## Common Issues & Solutions

### Gateway Timeout

- Server must include `Accept: application/json, text/event-stream` header
- Check server is running: `GET /servers/:id/health`

### Server Won't Start

- Check command manually: `npx -y <command>`
- Verify environment variables are set
- Check logs: `GET /servers/:id/logs`

### Auth Errors

- Verify token in config matches header
- Check header format: `Authorization: Bearer <token>`

## Testing New Features

1. Use minimal config for testing:
```yaml
managementPort: 8080
gatewayPort: 8090
auth:
  tokens: ["test-token"]
servers:
  memory:
    command: ["npx", "-y", "@modelcontextprotocol/server-memory"]
```

2. Test management API:
```bash
curl -H "Authorization: Bearer test-token" http://localhost:8080/servers
```

3. Test gateway:
```bash
curl -X POST \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://localhost:8090/mcp/memory
```

## Documentation

- `docs/` contains comprehensive documentation
- Update relevant doc when changing features
- Key docs: `configuration.md`, `api-reference.md`, `troubleshooting.md`

## Build & Release

```bash
# Build
npm run build

# Version bump
npm version patch  # or minor, major

# Test thoroughly before publishing
```

## External Dependencies

- **supergateway**: The core bridge - check their docs for CLI options
- **MCP SDK**: Used by supergateway for MCP protocol

## Contact

For issues or questions, refer to:
- GitHub Issues
- docs/troubleshooting.md
- docs/development.md
