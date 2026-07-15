# Transport Modes: supergateway vs DirectStdioTransport

oh-my-mcp supports two transport modes for communicating with MCP server child processes. Each mode is configured per-server in `config.yaml`.

## Quick Comparison

| Aspect | supergateway | DirectStdioTransport |
|--------|-------------|---------------------|
| Bridge process | Yes — `node <sg-path>/supergateway` wraps stdio→HTTP/SSE | No — writes JSON-RPC directly to child stdin |
| HTTP port | Allocated (default 8100+) | 0 (no HTTP port) |
| Request latency | ~+2ms per hop (TCP + serialize) | ~4ms local |
| Remote client support | ✅ Windows→WSL, LAN, VPS | ❌ stdio cannot cross machine boundary |
| Process count per server | 2 (server + supergateway) | 1 (server only) |
| Memory overhead | +~40MB per supergateway child | 0 overhead |
| Failure domain | Two processes can desync | Single process, single pipe |
| SSE streaming | ✅ supergateway handles it | ❌ not supported (single JSON-RPC response) |

## When to Use Each

### supergateway (default)

```
servers:
  ark-exec:
    command: ["node", "~/server/ark-exec/dist/index.js"]
    transport: supergateway
    enabled: true
```

Best for:
- **Remote clients** — Claude Desktop on Windows connecting to WSL gateway, Cursor on LAN, multi-host deployments
- **Non-Node servers** — supergateway wraps any stdio MCP server regardless of language
- **SSE streaming** — necessary for servers that use SSE for long-lived `tools/list` responses
- **Max compatibility** — works with all existing MCP client configurations

### DirectStdioTransport

```
servers:
  ark-memory:
    command: ["node", "~/server/ark-memory/dist/index.js"]
    transport: stdio
    enabled: true
```

Best for:
- **Local ark-* servers** — execute on the same machine as the gateway, zero reason to bridge through HTTP
- **Latency-sensitive workflows** — each request saves ~2ms by skipping TCP handshake + supergateway re-serialize
- **Resource-constrained environments** — one process per server instead of two
- **Simpler debugging** — `stdio: inherit` on the gateway reveals child process stdout directly

## Latency Breakdown

Measured from `echo-mcp-server.mjs` integration test (localhost, no auth):

| Step | supergateway | stdio |
|------|-------------|-------|
| Express parse JSON body | ~0.1ms | ~0.1ms |
| Route to server | ~0.01ms | ~0.01ms |
| proxyMCPRequest dispatch | — | ~0.01ms |
| HTTP proxy to supergateway | ~0.8ms | — |
| supergateway Express re-parse | ~0.1ms | — |
| JSON.stringify → child stdin | ~0.05ms | ~0.05ms |
| Child process stdin→stdout | ~2.5ms | ~2.5ms |
| JSON.parse from child stdout | ~0.05ms | ~0.05ms |
| SSE framing (`data:\n\n`) | ~0.05ms | — |
| Express res.json() | ~0.1ms | ~0.1ms |
| **Total** | **~3.7ms** | **~2.8ms** |

The ~1ms difference is entirely the TCP roundtrip + supergateway Express re-parse. JSON serialization cost is identical in both paths — both call `JSON.stringify` once to write stdin and call `JSON.parse` once to read stdout.

## Serialization Path (proving JSON cost is identical)

### supergateway

```
Client JSON-RPC body
  → Express.json()           (parse string → object)
  → Gateway http.request     (forward as raw HTTP body)
  → supergateway Express     (parse string → object again)
  → JSON.stringify(msg)      → child.stdin.write
  → Child writes JSON to stdout
  → JSON.parse(line)         (parse string → object)
  → SSE: `data: {jsonrpc}\n\n`
  → Gateway pipe             (forward raw HTTP/SSE bytes)
  → Express res.json()       (serialize for HTTP)
```

Total parse/serialize cycles: **3** (2 parse + 1 stringify)

### DirectStdioTransport

```
Client JSON-RPC body
  → Express.json()           (parse string → object)
  → JSON.stringify(body)     → child.stdin.write
  → Child writes JSON to stdout
  → JSON.parse(line)         (parse string → object)
  → Express res.json()       (serialize for HTTP)
```

Total parse/serialize cycles: **3** (2 parse + 1 stringify)

Identical serialization cost. The supergateway overhead is the extra TCP connection and hop-by-hop header handling, not JSON processing.

## StreamableHttp Stateful Mode (current default)

As of oh-my-mcp v1.1.0, supergateway runs with `--outputTransport streamableHttp --stateful` (replacing the previous SSE mode). This eliminates the ~32ms SSE→MCP conversion overhead and the per-request child process spawn.

### How stateful sessions work

1. **Initialize** — client sends `initialize` via `POST /mcp`. Supergateway spawns the child process and returns `Mcp-Session-Id` response header
2. **Reuse** — subsequent requests include the `Mcp-Session-Id` header. The same child process handles all requests in the session
3. **Timeout** — If `sessionTimeout` is configured, idle sessions are cleaned up. If omitted, the session lives until the client sends `DELETE` or the process exits
4. **Cleanup** — `DELETE /mcp` with session ID terminates the session and kills the child

### Session tracking in SuperGatewayTransport

The `SuperGatewayTransport` class captures `Mcp-Session-Id` from the initialize response and includes it in all subsequent requests. If a 400 response indicates session expiry, the transport resets its session ID so the next call re-initializes.

### Health checking

Health checks use supergateway's `--healthEndpoint /healthz` (GET, returns "ok"). All health check code paths use this endpoint:
- `SuperGatewayTransport.isReady()` — polling loop
- `SuperGatewayTransport.healthCheck()` — single check

### Configuration

Optional per-server:

```yaml
servers:
  my-server:
    command: ["npx", "-y", "@modelcontextprotocol/server-example"]
    transport: supergateway
    sessionTimeout: 60000   # idle timeout before child cleanup (omit = indefinite)
```

### Benchmark impact

| Metric | SSE (before) | StreamableHttp Stateful (after) |
|--------|-------------|-------------------------------|
| SSE→MCP conversion | ~32ms | 0 (direct JSON-RPC) |
| Per-request child spawn | ~50-1123ms setup variance | 0 (process persists) |
| Request response | ~10-25ms tool calls | ~8-11ms tool calls |

## Configuration

Both modes share the same server config structure. The only difference is the `transport` field:

```yaml
servers:
  my-server:
    command: ["node", "server.mjs"]
    transport: stdio           # or "supergateway"
    timeout: 30000
    enabled: true
```

The `timeout` field applies to the MCP request timeout in both modes. For supergateway, there's an additional implicit 60s HTTP proxy timeout from the gateway.

## Migration: supergateway → stdio

A server using supergateway can switch to stdio with one config change:

```diff
 servers:
   ark-memory:
     command: ["node", "~/server/ark-memory/dist/index.js"]
-    transport: supergateway
+    transport: stdio
```

The gateway detects the transport type via `transport.usesPort()` and routes requests accordingly. No code changes, no restart required (config hot-reload applies it live).

### Behavior changes

- `server.port` will be `0` instead of an allocated port number
- `POST /mcp/my-server` still works identically from client perspective
- The supergateway child process is no longer spawned — memory drops by ~40MB per server
- SSE streaming no longer available for that server (stdio transport returns single JSON-RPC response)

## Integration Test

The full stdio gateway loop is verified in `test/integration/stdio-gateway.test.ts`:

1. Spawns a real echo MCP server as a child process
2. Starts oh-my-mcp with `transport: stdio` config
3. Sends `POST /mcp/echo` with `tools/list` → verifies tools list returned
4. Sends `POST /mcp/echo` with custom method → verifies params echoed back
5. Stops server → verifies 503 response
6. Restarts server → verifies resumed operation

Run with: `npx vitest run test/integration/stdio-gateway.test.ts`

## API Design: proxyMCPRequest

The `ServerManager.proxyMCPRequest(id, body)` method handles transport selection:

```
proxyMCPRequest(id, body)
  ├── server not found / not running → null
  ├── transport.usesPort() == true   → { handled: false }
  │     (gateway falls back to HTTP proxy)
  └── transport.usesPort() == false  → { handled: true, status, headers, body }
        (gateway writes response directly)
```

Key design property: **the gateway never needs to know transport types**. It calls `proxyMCPRequest` and either gets a direct response (stdio) or a signal to fall through to HTTP proxy (supergateway). Adding a third transport mode requires zero gateway changes.

## Runtime Server Registration

Servers can be registered at runtime via the management API without editing `config.yaml`. Registered servers persist in `~/.local/share/oh-my-mcp/runtime-servers.json` and survive restarts.

### API

```
POST /servers/:id   → register, persist, start
DELETE /servers/:id  → stop, unregister, remove from cache
```

`POST` accepts the same `ServerConfig` body as `config.yaml`:

```json
{
  "command": ["node", "server.mjs"],
  "transport": "stdio",
  "timeout": 30000,
  "enabled": true
}
```

### Lifecycle

1. **Registration** — body is Zod-validated, added to runtime config, persisted to JSON cache, auto-started
2. **Restart** — cache is loaded and merged into config on startup. `config.yaml` wins on ID collision (config.yaml server starts, cache entry for same ID is skipped)
3. **Config reload** — hot-reload from file edit detects runtime servers in `removed` via diff and stops them, but cache entry persists. Server comes back on next restart unless `DELETE /servers/:id` was called first
4. **Deletion** — `DELETE` stops the server, removes from runtime config, and deletes the cache entry
