# Testing oh-my-mcp

Verification guide for the MCP Host (M0) and native remote transport (M1).
Keep these checks green after every change — especially the M1 native-remote
migration, which removes `mcp-remote-bridge.sh` and changes how `context7` /
`exa` are reached.

## 1. Unit & integration suite

```bash
npm run build          # tsc --build
npx vitest run         # full suite (216 tests)
```

Run a single file:

```bash
npx vitest run test/infrastructure/transports/SuperGatewayTransport.test.ts
```

Key suites:

| File | Covers |
|------|--------|
| `test/application/ToolCatalog.test.ts` | namespaced `{serverId}__{tool}` aggregation, TTL, degraded mode |
| `test/application/SessionManager.test.ts` | session create/get/expire/delete |
| `test/integration/mcp-host.test.ts` | POST `/mcp/server` initialize → tools/list → tools/call |
| `test/infrastructure/transports/SuperGatewayTransport.test.ts` | SSE parse, session id capture/forward, Accept header |
| `test/infrastructure/transports/RemoteClient.test.ts` | native remote connect/sendRequest/close, `{env:VAR}` interpolation |

## 2. Live MCP Host smoke test (M0)

The MCP Host endpoint lives on the **management port (8080)** at
`POST /mcp/server`. It is mounted only when `mcpHost.enabled: true` in config.

```bash
TOKEN=$(head -c 64 ~/.config/oh-my-mcp/auth-token)

# 1. initialize — returns a Mcp-Session-Id header
curl -s -D /tmp/h.txt http://localhost:8080/mcp/server \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}'
SID=$(grep -i mcp-session-id /tmp/h.txt | tr -d '\r' | awk '{print $2}')

# 2. tools/list — aggregated catalog, namespaced by server
curl -s http://localhost:8080/mcp/server \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# 3. tools/call — route by serverId__toolName
curl -s http://localhost:8080/mcp/server \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ark-exec__get_cache_stats","arguments":{}}}'
```

Expected: `initialize` returns a session id; `tools/list` returns ~82 tools
(namespaced `ark-exec__*`, `ark-memory__*`, …); `tools/call` returns the tool
result. If `tools/list` is empty, check the journal for `catalog refresh
backend` — every backend must report `healthy: true` (requires only
`isRunning()`, not the periodic HealthChecker).

## 3. Known gotchas (M0)

- **supergateway streamableHttp returns SSE-framed responses** (`event:
  message\ndata: {...}`), not raw JSON. `SuperGatewayTransport` parses the
  `data:` line. Sending `Accept: application/json` alone does not disable SSE.
- **Stateful sessions must be shared.** Each `SimpleBackendClient` builds a
  fresh `SuperGatewayTransport`, so the per-server `mcp-session-id` is stored in
  `ServerManager` (session store) and reused across initialize / tools/list /
  tools/call. Without this, `tools/list` hits a dead session → HTTP 400.
- **`initialize` must carry `clientInfo`.** The MCP SDK rejects initialize
  requests missing `clientInfo` with HTTP 400. The host always sends its own
  `clientInfo` to backends.
- **`initialize` must NOT send a stale session id.** The transport clears its
  session before sending `initialize`.

## 4. Native remote transport (M1)

`context7` and `exa` are configured as `transport: remote` with native HTTP
URLs. They are owned by `RemoteClient` (raw `fetch`), NOT spawned as child
processes and NOT wrapped by `mcp-remote-bridge.sh` (deleted).

Verify they are reachable through the host:

```bash
# after initialize + tools/list above, confirm remote tools are present
curl -s http://localhost:8080/mcp/server -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | python3 -c "import sys,json; t=json.load(sys.stdin)['result']['tools']; \
                print([x['name'] for x in t if x['name'].startswith('context7') or x['name'].startswith('exa')])"
```

`ServerManager.startServer` skips `transport: "remote"` entries (they are not
child processes). If a remote server is down, the host degrades gracefully —
its tools are simply absent from the catalog.

## 5. Client-side testing

Point an MCP client (e.g. Claude Desktop / a supergateway client cmd) at the
host endpoint. The host speaks streamableHttp, so the client must use
`--streamableHttp`, not `--sse`:

```text
supergateway --streamableHttp http://localhost:8080/mcp/server
```

For per-server direct connections (bypassing the host), each downstream server
exposes its own streamableHttp endpoint on its port (e.g. ark-exec on 8101):

```text
supergateway --streamableHttp http://127.0.0.1:8101/mcp
```

The old `--sse http://.../sse` form no longer exists after the stateful
streamableHttp migration.

## 6. Restart after changes

```bash
systemctl --user restart oh-my-mcp
# or, if no systemd user service:
# setsid node dist/index.js
```

The MCP Host endpoint is mounted at **startup** (not hot-reloaded), so any
change to `mcpHost` config or the router requires a full restart.
