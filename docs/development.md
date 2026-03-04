# Development Guide

Guide for developers contributing to oh-my-mcp.

## Project Structure

```
oh-my-mcp/
├── src/
│   ├── index.ts          # Main entry point
│   ├── config.ts         # Type definitions & Zod schemas
│   ├── config_loader.ts  # Config loading & hot reload
│   ├── logger.ts        # Pino logger setup
│   ├── server_manager.ts # Process management
│   ├── auth.ts          # Authentication middleware
│   ├── api.ts           # Management REST API
│   └── gateway.ts       # MCP proxy gateway
├── docs/                # Documentation
├── dist/                # Compiled JavaScript
├── package.json
├── tsconfig.json
└── config.yaml          # Runtime config
```

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn

### Install Dependencies

```bash
npm install
```

### Development Mode

Run with hot reload:

```bash
npm run dev
```

This uses `tsx watch` for auto-reload on changes.

### Build

```bash
npm run build
```

Compiles TypeScript to `dist/`.

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer explicit types over `any`
- Use Zod for runtime validation

### Formatting

Use the project's default settings (no custom formatter configured yet).

### Linting

Not configured yet. Run TypeScript check:

```bash
npx tsc --noEmit
```

## Adding Features

### 1. Add Configuration

Edit `src/config.ts`:

```typescript
export const ConfigSchema = z.object({
  // ... existing fields
  newOption: z.string().optional(),
});
```

### 2. Implement Feature

Add implementation in appropriate module.

### 3. Add API Endpoint

Edit `src/api.ts`:

```typescript
router.get('/new-endpoint', async (req, res) => {
  // implementation
});
```

### 4. Add Tests

Create test file in `test/` (not implemented yet):

```typescript
// test/api.test.ts
import { describe, it, expect } from 'vitest';

describe('API', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
```

## Debugging

### Enable Debug Logging

```yaml
# config.yaml
logLevel: debug
```

### VS Code Debug

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/index.ts",
      "runtimeArgs": ["-r", "tsx"]
    }
  ]
}
```

### Test MCP Server Manually

```bash
# Start supergateway directly
npx -y supergateway --stdio "npx -y @modelcontextprotocol/server-memory" --port 8300

# Test in another terminal
curl -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' http://localhost:8300/mcp
```

## Testing

### Run Tests

```bash
npm test
```

Tests are not implemented yet. To add:

```bash
npm install -D vitest
```

Add to package.json:

```json
{
  "scripts": {
    "test": "vitest"
  }
}
```

## Building Release

### 1. Update Version

```bash
npm version patch  # or minor, major
```

### 2. Build

```bash
npm run build
```

### 3. Test

```bash
npm run dev
# Test all features
```

### 4. Publish

```bash
npm publish
```

## Common Tasks

### Add New MCP Server Type

1. Document in `docs/configuration.md`
2. Add example in `config.example.yaml`

### Fix Bug

1. Create branch: `git checkout -b fix/bug-description`
2. Fix in `src/`
3. Add test if applicable
4. Build and test
5. Commit and push
6. Create PR

### Add New API Endpoint

1. Add route in `src/api.ts`
2. Document in `docs/api-reference.md`
3. Add example in docs

## Architecture Notes

### Server Manager

The `ServerManager` class:
- Spawns supergateway as child processes
- Each MCP server gets its own port (8100+)
- Monitors health via MCP protocol
- Auto-restarts on crash

### Gateway Proxy

The gateway:
- Uses http-proxy-middleware
- Routes `/mcp/:serverId` to appropriate port
- Strips path prefix before proxying

### Authentication

Simple bearer token:
- Tokens configured in `config.yaml`
- Middleware validates on every request
- No token = 401 Unauthorized

## Contributing

1. Fork the repo
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit PR

## Resources

- [supercorp-ai/supergateway](https://github.com/supercorp-ai/supergateway)
- [Model Context Protocol](https://spec.modelcontextprotocol.io/)
- [Express.js](https://expressjs.com/)
- [Pino Logging](https://getpino.io/)
