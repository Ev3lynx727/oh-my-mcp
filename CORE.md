# Core Engine Integration Plan

**Status**: Draft — Awaiting execution  
**Created**: 2026-03-04  
**Scope**: Integrate core utilities (ConfigCache, HttpClient, HealthChecker) into the main application flows before Phase 3 (Transport) and Phase 4 (Testing).

---

## 🎯 Objectives

- Ensure the "core engine" of oh-my-mcp uses all the foundational components we've built.
- Prevent half-wired core during testing and future refactors.
- Establish clean data flows: config → server lifecycle → health monitoring → management API.
- Use HttpClient consistently (no raw `fetch`) for reliability and observability.

---

## 📦 Current State

| Component | Implemented | Integrated | Notes |
|-----------|------------|------------|-------|
| Domain (`MCPServer`) | ✅ | ✅ | Used by ServerManager |
| ProcessManager | ✅ | ✅ | Spawns/kills processes |
| PortAllocator | ✅ | ✅ | Port lifecycle managed |
| EventBus | ✅ | ✅ | ServerManager emits events |
| DI Container | ✅ | ✅ | ServerManager resolved from container |
| HttpClient | ✅ | ❌ | Not yet used (raw fetch in place) |
| HealthChecker | ✅ | ❌ | Not yet used (inline fetch in `ServerManager.healthCheck`) |
| ConfigCache | ✅ | ❌ | Not yet used (config_loader reads file each change) |
| Middleware (error, request-id) | ✅ | ✅ | Mounted on Express apps |

---

## 🔌 Integration Tasks

### Task 1: Integrate ConfigCache into `config_loader.ts`

**Goal**: Cache parsed config to avoid redundant file reads/parsing during rapid config changes.

**Changes**:

- In `config_loader.ts`:
  - Create a `ConfigCache<ValidatedConfig>` instance (singleton or module-level).
  - When `loadConfig` is called:
    - If cache has fresh entry (TTL default 1s), return cached config.
    - Else read file, parse, validate, store in cache, return.
  - When `watchConfig` detects change:
    - Invalidate cache entry for that file path.
    - Then load fresh config and repopulate cache.
- Optionally, log cache hit/miss for monitoring.

**Impact**:

- Reduces I/O and CPU during config churn.
- No behavioral change from API perspective.

**Validation**:

- Rapid config edits (multiple changes in <1s) do not cause multiple file reads/parses.
- Logs show cache usage if debug enabled.

---

### Task 2: Replace raw `fetch` with `HttpClient` in `ServerManager`

**Goal**: Use the robust HttpClient for all outgoing HTTP calls (health checks, server info, readiness probe).

**Changes**:

- Inject `HttpClient` into `ServerManager` via DI container:
  - Add to `AppModule.register`: `container.register(HttpClient, { useClass: HttpClient, singleton: true });`
  - Update `ServerManager` constructor to accept `httpClient: HttpClient`.
- Replace `fetch` calls with `httpClient.post`:
  - `waitForServer()`: use `httpClient.post(..., { timeout: 30000 })` with retries? or just timeout.
  - `healthCheck()`: use `httpClient.post(..., { timeout: server.getTimeout() })`.
  - `getServerInfo()`: use `httpClient.post(..., { timeout: server.getTimeout() })`.
- Adjust error handling:
  - `HttpClient` throws `HttpError` or `TimeoutError`. Catch and interpret appropriately.
  - Maintain backward-compatible return values (boolean for health, object or null for info).
- Ensure `HttpClient` is configured with reasonable defaults (timeout from server config or 5s default, retries 0 or 1).

**Impact**:

- Centralized retry and timeout logic.
- Consistent error shapes.
- Easier to add tracing/metrics later.

**Validation**:

- Health checks still work after switching to HttpClient.
- Timeouts respected.
- HttpError messages logged appropriately.

---

### Task 3: Wire HealthChecker into ServerManager

**Goal**: Delegate health checking to the HealthChecker service, removing inline fetch logic.

**Changes**:

- Inject `HealthChecker` into `ServerManager` via DI.
- Replace `ServerManager.healthCheck()` body with:

  ```typescript
  const healthy = await this.healthChecker.check(server);
  server.updateHealth(healthy);
  return healthy;
  ```

- Optionally, HealthChecker can return an error message on failure; we can pass to `updateHealth(healthy, message)`.
- The `HealthChecker` already uses `HttpClient` internally; we could either:
  - Option A: Let HealthChecker create its own HttpClient (simple) — but then DI duplication.
  - Option B: Inject HttpClient into HealthChecker (already done if using factory with container).
  - We'll go with Option B: HealthChecker is already registered in AppModule with `useFactory: c => new HealthChecker(c.resolve(HttpClient))`.
- Optionally, `ServerManager` could also read health interval and schedule periodic checks, but that's a later enhancement.

**Impact**:

- Health logic centralized.
- Easier to adjust health check parameters without touching ServerManager.

**Validation**:

- Health endpoint (`/servers/:id/health`) returns same results.
- Consecutive failures still update domain health state.

---

### Task 4: Use ConfigCache in `config_loader.ts`

**Goal**: Cache parsed configuration to reduce file I/O during hot reload.

**Changes**:

- In `config_loader.ts`:
  - Import `ConfigCache` and create a module-level instance: `const configCache = new ConfigCache<ValidatedConfig>(1000); // 1s TTL`
  - `loadConfig(path)`:
    - Check `configCache.get(path)`; if present, return cached.
    - Else, load file, parse, validate, store in cache, return.
  - `watchConfig` callback:
    - Before loading new config, call `configCache.invalidate(path)`.
    - Then load fresh config (which will repopulate cache).
  - Optionally, allow cache TTL to be configurable via environment or config, but default 1s is fine.

**Impact**:

- Prevents redundant reads/parsing if `watchConfig` fires multiple times quickly (common on some editors).
- No API change.

**Validation**:

- Rapid config edits (touch file multiple times quickly) result in only one read/parse per TTL window.
- Logs (if debug) show cache hit/miss.

---

### Task 5: Ensure HttpClient is used consistently in readiness probe

**Goal**: `waitForServer` should use HttpClient with appropriate timeout and retry behavior.

**Changes** (covered in Task 2):

- In `ServerManager.waitForServer`, replace `fetch` with `this.httpClient.post(...)`.
- Set timeout to maybe 30s (same as before) with retries=0 (we want to know when it's ready).
- Keep polling behavior (loop with 500ms delay) but use HttpClient for each attempt.

**Edge**: HttpClient throws on non-2xx; MCP server may return 400 during init. We should consider 400 as "ready"? Current logic accepts 200 or 400. We'll keep that by checking `response.ok || response.status === 400`. But HttpClient throws on non-ok; we might need to allow 400 without throw. So we could use `httpClient.request` with custom `validateStatus` option, or simply catch HttpError and treat 400 as non-exception. Simpler: create a method `httpClient.postAllowStatus(..., allowedStatuses=[200,400])`. But to keep scope small, we'll wrap:

```typescript
try {
  const response = await this.httpClient.post(url, body, { timeout });
  return response.ok;
} catch (err: any) {
  if (err instanceof HttpError && err.status === 400) {
    return true; // consider ready
  }
  throw err;
}
```

Actually we want to treat any response (even 500?) as server being "up" but not ready. The current logic only cares about getting a response (not 404/connection refused). So we can adjust: treat any response as ready, but only 200/400 as successful MCP initialize. But for readiness, any HTTP response indicates server is up. We'll keep original: check `response.ok || response.status === 400` as condition to return. So we need to capture the response even if not ok. So we need a fetch variant that doesn't throw on non-2xx. We can use `httpClient.get` with `validateStatus: (status) => status < 600` to always return Response. Simpler: we can use a raw fetch for this one spot because it's a tight loop and we want minimal overhead. But to be consistent, let's extend HttpClient with a `requestNoThrow` or allow callback. Alternatively, accept that HttpClient throws on non-2xx and interpret 400 as "ready but bad request" and return true; for other errors throw and continue loop. That works: treat 400 as success, any other HttpError as not ready. We'll adjust accordingly.

Given scope, it's okay to keep `waitForServer` using raw fetch for now? No, we want HttpClient everywhere. Let's adjust: We'll catch HttpError, and if status is 400, consider ready; else continue.

Implementation:

```typescript
try {
  const response = await this.httpClient.post(`http://localhost:${port}/mcp`, body, { timeout });
  if (response.ok || response.status === 400) return;
} catch (err: any) {
  if (err instanceof HttpError && err.status === 400) return;
  // else continue
}
```

But wait: if HttpClient throws on 400, we never get a Response. So we need HttpClient to not throw on 400. We could add an option `throwOnStatus: (status) => boolean` default `status >= 400`. That's a bit larger change. Alternative: Use HttpClient for the happy path and raw fetch for this one? That's inconsistent.

Given the limited time and that this is internal readiness check, I'm leaning towards:

- Keep raw fetch in `waitForServer` (it's a simple loop, no retries needed).
- Use HttpClient for all *external* HTTP calls that need reliability (health checks, server info).
- In future, we could refactor HttpClient to be more flexible, but not needed now.

We'll note this as a minor gap. For now, Task 2 only replaces healthCheck and getServerInfo with HttpClient. `waitForServer` remains raw fetch for simplicity. That's acceptable.

---

## 📋 Proposed Order

1. **Task 4** first: Integrate ConfigCache into config_loader (low risk, high benefit for hot reload).
2. **Task 2**: Replace fetch in healthCheck and getServerInfo with HttpClient.
3. **Task 3**: Wire HealthChecker into ServerManager (HealthChecker uses HttpClient).
4. **Task 5**: Ensure HTTP client consistency in health/info and consider any edge cases.
5. Run build and smoke tests.
6. Proceed to Phase 3 (Transport).

Total expected effort: ~2–3 hours for implementation + smoke.

---

## ✅ Validation Checklist

After integration:

- [ ] `npm run build` passes
- [ ] Server starts with config cache active (no errors)
- [ ] Changing config file triggers cache invalidate and reload (logs show cache miss)
- [ ] Health endpoint (`/servers/:id/health`) uses HealthChecker (logs show health check calls)
- [ ] Server info (`/servers/:id/info`) works via HttpClient
- [ ] Error responses from backend MCP servers are handled gracefully
- [ ] No raw `fetch` in ServerManager except `waitForServer` (allowed exception)
- [ ] Memory server can be stopped/started, health checks succeed

---

## 📌 Notes

- The `HttpClient` currently lacks ability to stream or handle SSE; that's fine because we only use it for request/response patterns (initialize, tools/list).
- The `HealthChecker` could be enhanced later to emit health events via EventBus and track history; current simple bool is sufficient.
- ConfigCache TTL of 1s is chosen to prevent thrashing while still picking up rapid edits (most editors write temp then rename; watch may fire multiple times).
- Future: `config_loader` could also use `fs.watch` with debounce; but cache adds robustness.

---

## 🧭 Next Phases (after Core Integration)

- **Phase 3**: Transport abstraction (replace supergateway dependency)
- **Phase 4**: Testing (vitest, unit + integration, CI)
- **Phase 5**: Observability (metrics, rate limiting, audit)
- **Phase 6**: Documentation polish

---

**Approved**: Yes, we should proceed with **Option A (Solidify core first)** following this integration plan.
