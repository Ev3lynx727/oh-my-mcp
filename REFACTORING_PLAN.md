# Refactoring Plan: oh-my-mcp

**Created**: 2026-03-04
**Based on**: Architectural review (ghostclaw) - Vibe Score: 72/100
**Goal**: Improve maintainability, testability, and scalability while preserving current functionality

---

## 📋 Executive Summary

This refactoring plan addresses key architectural issues in oh-my-mcp:

- **Tight coupling** in ServerManager and index.ts
- **Missing domain models** and abstractions
- **Hard-coded dependencies** (supergateway)
- **Testing difficulties** due to monolithic structure
- **Race conditions** and error handling gaps

**Expected Outcomes**:

- 40% reduction in cyclomatic complexity per module
- 100% unit test coverage for core logic
- 50% faster startup time (through better health checks)
- Support for multiple transport types (stdio, SSE, WebSocket)
- Easier debugging and monitoring

---

## ✅ Phase 0 Completed (2026-03-04)

**Scope**: P0-1 (Domain Models), P0-2 (ProcessManager), P0-3 (Hot-Reload Fix)

**Deliverables**:

- Domain layer with `MCPServer` class and comprehensive types (`ServerStatus`, `HealthStatus`, etc.)
- ProcessManager extracted; ServerManager delegates lifecycle to it
- Hot-reload race condition fixed: removed/disabled servers are now stopped on config change
- Backward compatibility preserved (public API unchanged)
- Build passes, dev server stable, smoke tests validated

**Status**: 3/3 tasks complete (100%)

---

## 🎯 Priority Matrix

| Priority | Impact | Effort | First Target |
|----------|--------|--------|--------------|
| P0 | High | Medium | `ServerManager` extraction, domain models |
| P1 | High | Low | Hot-reload fixes, error handling |
| P2 | Medium | Medium | DI container, transport abstraction |
| P3 | Medium | High | Comprehensive testing suite |
| P4 | Low | Low | Quick wins (metrics, compression) |

---

## 📅 Phased Implementation Plan

### **PHASE 1: Foundation & Quick Wins** (Week 1-2)

**Goal**: Lay groundwork, fix critical bugs, improve developer experience

#### P0-Tasks (Must Do First)

##### **P0-1: Extract Domain Models**

- **Effort**: 2 days
- **Files to create**: `src/domain/Server.ts`, `src/domain/ServerStatus.ts`, `src/domain/HealthStatus.ts`
- **Dependencies**: None
- **Acceptance**:
  - [ ] `MCPServer` class encapsulates all server state
  - [ ] Factory method to create from config
  - [ ] Methods: `isRunning()`, `isHealthy()`, `canAcceptRequests()`
  - [ ] Business rules in domain (e.g., status transitions)
- **Breaking changes**: None (just adds new classes)
- **Migration**: Gradual - ServerManager can adopt progressively

##### **P0-2: Extract ProcessManager**

- **Effort**: 1 day
- **Files**: `src/application/ProcessManager.ts`
- **Dependencies**: P0-1 (uses MCPServer)
- **Acceptance**:
  - [ ] ProcessManager.start(server: MCPServer)
  - [ ] ProcessManager.stop(server: MCPServer)
  - [ ] ProcessManager.restart(server: MCPServer)
  - [ ] Auto-restart logic with configurable backoff
  - [ ] Event emission (process spawned, exited, errored)
- **Breaking changes**: None (ServerManager will use it internally)
- **Refactor**: Move spawn/child process logic out of ServerManager

##### **P0-3: Fix Hot-Reload Race Condition**

- **Effort**: 2 hours
- **File**: `src/index.ts` (watchConfig handler)
- **Dependencies**: P0-1, P0-2 (need manager interface changes)
- **Acceptance**:
  - [ ] Detect removed servers from config
  - [ ] Detect disabled servers (enabled: false)
  - [ ] Call stopServer() for removed/disabled servers
  - [ ] Log action with server ID
- **Breaking changes**: None

##### **P0-4: Add Graceful Shutdown with Timeout**

- **Effort**: 2 hours
- **File**: `src/index.ts`
- **Dependencies**: P0-2 (ensure stopAll() is reliable)
- **Acceptance**:
  - [x] Implemented `shutdown` helper with Promise.race
  - [x] SIGTERM/SIGINT handlers wait max 10s
  - [x] Logs shutdown progress and outcome
  - [x] Always exits process (even if timeout)
- **Status**: ✅ Complete
- **Breaking changes**: None

##### **P1-1: Port Allocator with Release**

- **Effort**: 1 day
- **Files**: `src/application/PortAllocator.ts`
- **Dependencies**: P0-1 (needs MCPServer.port tracking)
- **Acceptance**:
  - [x] `allocate(): number` returns next port (prefers released)
  - [x] `release(port: number): void` returns port to pool
  - [x] Tracks allocated ports in Set, released ports in LIFO stack
  - [x] Reuses released ports before allocating new ones
  - [x] `reserve(port)` for manual ports (prevent allocation)
  - [x] Manual ports not released on stop; auto ports are released
- **Status**: ✅ Complete
- **Breaking changes**: None (internal improvement)
- **Validated**: stop/start reuses auto port 8100; manual port conflict error works

##### **P1-2: Error Handling Middleware**

- **Effort**: 3 hours
- **Files**: `src/middleware/error-handler.ts`, update `src/index.ts`
- **Dependencies**: None
- **Acceptance**:
  - [x] Central error handler for management and gateway apps
  - [x] Structured logging (method, path, status, message)
  - [x] Sanitized errors in production (no stack traces)
  - [x] Respects `err.status` for HTTP status (default 500)
  - [x] Returns `{ error, status }` JSON response
- **Status**: ✅ Complete
- **Breaking changes**: None

##### **P1-3: Request ID Tracking**

- **Effort**: 3 hours
- **Files**: `src/middleware/request-id.ts`, update `src/index.ts`
- **Dependencies**: None
- **Acceptance**:
  - [x] Generates UUID (crypto.randomUUID) per request
  - [x] Sets `X-Request-ID` response header
  - [x] Attaches `req.id` and `req.log` (Pino child logger with request ID)
  - [x] Mounted on all Express apps (main, management, gateway)
  - [x] Base logger stored on app for child logger creation
- **Status**: ✅ Complete
- **Breaking changes**: None

---

### **PHASE 2: ServerManager Split & DI** (Week 3-4)

**Goal**: Single Responsibility, Testability

#### P2-Tasks

##### **P2-1: HealthChecker Class**

- **Effort**: 1 day
- **Files**: `src/application/HealthChecker.ts`
- **Status**: ✅ Complete
- **Dependencies**: HttpClient
- **Acceptance**:
  - [x] `check(server: MCPServer, timeoutMs?): Promise<boolean>`
  - [x] Uses server.healthCheck.timeout or default 5s
  - [x] Returns true/false based on MCP tools/list response
  - [x] Independent from ServerManager; can be injected
- **Breaking changes**: Minor; HealthChecker not yet used by ServerManager (inline health still present)

##### **P2-2: HTTP Client Abstraction**

- **Effort**: 1 day
- **Files**: `src/infrastructure/http/HttpClient.ts`
- **Status**: ✅ Complete
- **Dependencies**: None
- **Acceptance**:
  - [x] Wrapper around fetch with retry (exponential), timeout, abort
  - [x] Options: timeout, retries, backoffFactor, maxBackoffMs, baseUrl
  - [x] Error types: HttpError (status/body), TimeoutError
  - [x] Minimal logging via logger (debug)
- **Breaking changes**: None (new utility, used by HealthChecker)

##### **P2-3: Config Refactor - Caching Layer**

- **Effort**: 2 days
- **Files**: `src/infrastructure/config/ConfigCache.ts`
- **Status**: ✅ Complete
- **Dependencies**: None
- **Acceptance**:
  - [x] ConfigCache<T> with get/set/invalidate/clear/prune
  - [x] TTL-based expiration, default 1s
  - [x] Safe for single-threaded use; `prune()` available
  - [x] Ready to be used in `config_loader.ts` to prevent thrashing
- **Breaking changes**: None (internal utility)

##### **P2-4: Event Bus Abstraction**

- **Effort**: 1 day
- **Files**: `src/application/EventBus.ts`
- **Status**: ✅ Complete
- **Acceptance**:
  - [x] EventBus extends EventEmitter with clear API (on, off, once, emit, listenerCount)
  - [x] Used by ServerManager to emit events (`serverStarting`, `serverStarted`, etc.)
  - [x] ProcessManager can also emit events via EventBus in future
  - [x] Provides backward-compatible proxy on ServerManager (on/off/once/removeAllListeners)
- **Breaking changes**: Moderate; ServerManager no longer extends EventEmitter but proxies methods

##### **P2-5: Simple Dependency Injection Container**

- **Effort**: 1 day
- **Files**: `src/di/container.ts`, `src/di/modules/app.module.ts`
- **Status**: ✅ Complete
- **Acceptance**:
  - [x] Container with `register(token, binding)`, `resolve<T>(token)`, `has`, `createChild`
  - [x] Supports `useClass`, `useValue`, `useFactory`, singleton default
  - [x] AppModule composes all bindings (HttpClient, ConfigCache, HealthChecker, EventBus, PortAllocator, ProcessManager, ServerManager)
  - [x] Factory functions used to wire dependencies (e.g., ServerManager receives its collaborators)
- **Breaking changes**: Major; `index.ts` now uses container to resolve ServerManager

##### **P2-6: Refactor ServerManager to Use DI Components**

- **Effort**: 2 days
- **Files**: `src/server_manager.ts` (rewritten)
- **Status**: ✅ Complete
- **Dependencies**: All P0-P2 tasks
- **Acceptance**:
  - [x] Constructor injection: EventBus, PortAllocator, ProcessManager
  - [x] Code size ~200 LOC (core logic)
  - [x] Single responsibility: coordination only
  - [x] No direct `new` of dependencies; all injected
  - [x] Uses EventBus for events; retains backward-compatible event listener API
- **Breaking changes**: Major; ServerManager no longer extends EventEmitter, but API remains compatible

---

### **PHASE 3: Transport Abstraction** (Week 5-6)

**Goal**: Support diverse MCP server types

#### P3-Tasks

##### **P3-1: Define Transport Interface**

- **Effort**: 1 day
- **Files**: `src/domain/Transport.ts`
- **Dependencies**: P0-1
- **Acceptance**:
  - [ ] interface ServerTransport
  - [ ] Methods: `start(ServerConfig): Promise<ChildProcess>`
  - [ ] `getEndpoint(port: number): string`
  - [ ] `isReady(port: number): Promise<boolean>`
  - [ ] Proper TypeScript types
- **Breaking changes**: None (new abstraction)

##### **P3-2: Implement SuperGatewayTransport**

- **Effort**: 1 day
- **Files**: `src/infrastructure/transports/SuperGatewayTransport.ts`
- **Dependencies**: P3-1
- **Acceptance**:
  - [ ] Implements ServerTransport
  - [ ] Builds npx supergateway command correctly
  - [ ] Handles environment variable resolution
  - [ ] Configurable via ServerConfig flags
- **Breaking changes**: Moderate - ServerManager/ProcessManager use Transport instead of direct spawn

##### **P3-3: Implement DirectStdioTransport**

- **Effort**: 1 day
- **Files**: `src/infrastructure/transports/DirectStdioTransport.ts`
- **Dependencies**: P3-1, P3-2
- **Acceptance**:
  - [ ] For servers that speak MCP natively without supergateway
  - [ ] Uses stdio directly (no HTTP conversion)
  - [ ] Works with stdio-based MCP clients (no gateway needed)
  - [ ] Document when to use (experimental MCP servers)
- **Breaking changes**: None (new transport type)

##### **P3-4: Transport Factory**

- **Effort**: 3 hours
- **Files**: `src/infrastructure/transports/TransportFactory.ts`
- **Dependencies**: P3-1, P3-2, P3-3
- **Acceptance**:
  - [ ] createTransport(serverConfig): ServerTransport
  - [ ] Auto-detect based on config flags: `transport: "supergateway" | "stdio"`
  - [ ] Default to supergateway for backward compatibility
- **Breaking changes**: None (internal choice)

##### **P3-5: Update Config Schema for Transport**

- **Effort**: 2 hours
- **Files**: `src/config.ts`
- **Dependencies**: P3-1
- **Acceptance**:
  - [ ] Add `transport?: "supergateway" | "stdio"` to ServerConfig
  - [ ] Backward compatible (default to supergateway)
  - [ ] Update config.example.yaml and docs
- **Breaking changes**: None (optional field)

##### **P3-6: Update ServerManager to Use Transports**

- **Effort**: 1 day
- **Files**: `src/application/ServerManager.ts` (or ProcessManager)
- **Dependencies**: P3-4
- **Acceptance**:
  - [ ] ServerManager uses TransportFactory to get transport
  - [ ] Calls transport.start(config) instead of direct spawn
  - [ ] Passes port to transport for endpoint construction
- **Breaking changes**: Moderate - internal only, but fundamental change

---

### **PHASE 4: Testing Infrastructure** (Week 7-8)

**Goal**: 80%+ coverage, confidence in changes

#### P4-Tasks

##### **P4-1: Setup Test Framework**

- **Effort**: 1 day
- **Files**: Install vitest, create `test/` directory, `vitest.config.ts`
- **Dependencies**: None
- **Acceptance**:
  - [ ] vitest installed and configured
  - [ ] Test script in package.json
  - [ ] Coverage collection (c8/ Istanbul)
  - [ ] Utilities: test fixtures, mocks
- **Breaking changes**: None

##### **P4-2: Mock Infrastructure**

- **Effort**: 2 days
- **Files**: `test/mocks/child-process.ts`, `test/mocks/http.ts`, `test/mocks/fs.ts`
- **Dependencies**: P4-1
- **Acceptance**:
  - [ ] Mock ChildProcess with controllable stdout/stderr
  - [ ] Mock fetch for HTTP requests
  - [ ] Mock fs.watch for config hot-reload
  - [ ] Helper factories for common mock scenarios
- **Breaking changes**: None

##### **P4-3: Unit Tests - ProcessManager**

- **Effort**: 1 day
- **Files**: `test/application/ProcessManager.test.ts`
- **Dependencies**: P4-2, P0-2
- **Acceptance**:
  - [ ] start() spawns process correctly
  - [ ] stop() kills process and cleans up
  - [ ] restart() sequence is correct
  - [ ] Auto-restart on crash works
  - [ ] Event emission tests
  - [ ] Coverage: >90%
- **Breaking changes**: None

##### **P4-4: Unit Tests - PortAllocator**

- **Effort**: 3 hours
- **Files**: `test/application/PortAllocator.test.ts`
- **Dependencies**: P2-1
- **Acceptance**:
  - [ ] allocate() returns sequential ports by default
  - [ ] allocate() reuses released ports
  - [ ] release() frees port correctly
  - [ ] Manual ports are tracked but not allocated
  - [ ] No port collision
- **Breaking changes**: None

##### **P4-5: Unit Tests - ConfigLoader**

- **Effort**: 1 day
- **Files**: `test/infrastructure/config/ConfigLoader.test.ts`
- **Dependencies**: P2-3 (with mocks)
- **Acceptance**:
  - [ ] Loads YAML correctly
  - [ ] Loads JSON correctly
  - [ ] Validates against Zod schema
  - [ ] Rejects invalid config with helpful errors
  - [ ] Hot-reload triggers callback (with mocks)
- **Breaking changes**: None

##### **P4-6: Unit Tests - HealthChecker**

- **Effort**: 1 day
- **Files**: `test/application/HealthChecker.test.ts`
- **Dependencies**: P2-2, P4-2
- **Acceptance**:
  - [ ] check() sends MCP tools/list request
  - [ ] Returns false on timeout
  - [ ] Returns false on non-ok response
  - [ ] Returns true on successful response
  - [ ] Configurable timeout honored
- **Breaking changes**: None

##### **P4-7: Integration Tests - Full Flow**

- **Effort**: 2 days
- **Files**: `test/integration/gateway.test.ts`, `test/integration/management-api.test.ts`
- **Dependencies**: P4-1 through P4-6, real supergateway server
- **Acceptance**:
  - [ ] Start real MCP server (memory or everything)
  - [ ] Management API can start/stop/restart
  - [ ] Gateway API proxies correctly
  - [ ] Health checks work end-to-end
  - [ ] Auth middleware blocks invalid tokens
  - [ ] Hot-reload adds new server
  - [ ] Coverage: >70% overall
- **Breaking changes**: None (tests only)

##### **P4-8: CI/CD Pipeline**

- **Effort**: 1 day
- **Files**: `.github/workflows/ci.yml` or similar
- **Dependencies**: P4-1 to P4-7
- **Acceptance**:
  - [ ] CI runs on push/PR
  - [ ] Runs TypeScript check (noEmit)
  - [ ] Runs tests with coverage
  - [ ] Uploads coverage to Codecov (optional)
  - [ ] Fails if coverage drops below threshold (80%)
  - [ ] Lint step (ESLint) - add if not present
- **Breaking changes**: None

---

### **PHASE 5: Advanced Features** (Week 9-10)

**Goal**: Production readiness, observability

#### P4-Tasks (Lower Priority)

##### **P4-9: Prometheus Metrics**

- **Effort**: 1 day
- **Files**: `src/infrastructure/metrics/metrics.ts`, middleware
- **Dependencies**: P2-5 (can inject metrics service)
- **Acceptance**:
  - [ ] `/metrics` endpoint (text format)
  - [ ] Metrics: server count, uptime, request latency, error count
  - [ ] Use prom-client or simple custom
  - [ ] Document metrics
- **Breaking changes**: None (new endpoint)

##### **P4-10: Response Compression**

- **Effort**: 3 hours
- **Files**: `src/index.ts` (add compression middleware)
- **Dependencies**: None
- **Acceptance**:
  - [ ] compression() middleware on both apps
  - [ ] Enabled in prod, disabled in dev (debug logs)
  - [ ] Configurable threshold
- **Breaking changes**: None

##### **P4-11: Request Timeouts**

- **Effort**: 1 day
- **Files**: Middleware for gateway, healthChecker config
- **Dependencies**: P2-2 (HttpClient has timeout)
- **Acceptance**:
  - [ ] Gateway: timeout on proxy requests (default 60s)
  - [ ] Management API: timeout on server operations (start/stop)
  - [ ] Configurable per-server timeout (already in schema!)
  - [ ] Returns 504 Gateway Timeout on timeout
- **Breaking changes**: None

##### **P4-12: Rate Limiting**

- **Effort**: 2 days
- **Files**: `src/middleware/rate-limit.ts`
- **Dependencies**: None
- **Acceptance**:
  - [ ] Rate limit per IP on management API (aggressive: 100/min)
  - [ ] Rate limit per token on gateway (generous: 1000/min)
  - [ ] In-memory store (or Redis if needed)
  - [ ] Headers: X-RateLimit-* in response
- **Breaking changes**: None

##### **P4-13: Audit Logging**

- **Effort**: 1 day
- **Files**: `src/middleware/audit.ts`
- **Dependencies**: P1-3 (reuse request ID)
- **Acceptance**:
  - [ ] Log all management actions (start/stop/restart)
  - [ ] Include user token (masked), server ID, timestamp
  - [ ] Separate audit log file (pino destination)
  - [ ] Immutable audit trail (append-only)
- **Breaking changes**: None

---

### **PHASE 6: Documentation & Polish** (Week 11-12)

**Goal**: Complete docs, known production deployment

#### P5-Tasks

##### **P5-1: Update Architecture Documentation**

- **Effort**: 2 days
- **Files**: `docs/architecture.md`
- **Dependencies**: P0-P3 (after refactor)
- **Acceptance**:
  - [ ] New architecture diagram (with domain layer, DI)
  - [ ] Data flow diagrams for new components
  - [ ] Transport abstraction explained
  - [ ] Configuration examples for different transports
- **Breaking changes**: None (docs only)

##### **P5-2: Deployment Guides**

- **Effort**: 1 day
- **Files**: `docs/deployment-docker.md`, `docs/deployment-k8s.md`
- **Dependencies**: P4 (feature complete)
- **Acceptance**:
  - [ ] Dockerfile with multi-stage build
  - [ ] docker-compose.yml example
  - [ ] Kubernetes manifests (deployment, service, configmap, secret)
  - [ ] Environment variable reference
- **Breaking changes**: None

##### **P5-3: Troubleshooting Guide Enhancement**

- **Effort**: 1 day
- **Files**: `docs/troubleshooting.md`
- **Dependencies**: P4 (testing reveals common issues)
- **Acceptance**:
  - [ ] Common error messages and solutions
  - [ ] Debugging checklist (logs, health endpoints, ports)
  - [ ] Performance tuning tips
  - [ ] Production incidents and resolution
- **Breaking changes**: None

##### **P5-4: Upgrade Guide from v1.0**

- **Effort**: 1 day
- **Files**: `docs/upgrade-v1-to-v2.md`
- **Acceptance**:
  - [ ] Breaking changes summary (if any)
  - [ ] Migration steps for existing deployments
  - [ ] Rollback procedure
  - [ ] Config changes required
- **Breaking changes**: Depends on Phase 3+ decisions

##### **P5-5: Performance Tuning Guide**

- **Effort**: 1 day
- **Files**: `docs/performance-tuning.md`
- **Acceptance**:
  - [ ] Recommendations for 10, 50, 100+ servers
  - [ ] System resource requirements (CPU, RAM)
  - [ ] Network considerations
  - [ ] Tuning parameters: health check intervals, restart backoff, log level
- **Breaking changes**: None

---

## 🔄 Backward Compatibility Strategy

### **Phase 1-2**: 100% backward compatible

- No breaking changes to API or config
- Existing deployments work unchanged

### **Phase 3**: Opt-in features

- New transport type is optional
- Default behavior (supergateway) unchanged
- Config field is optional with default

### **Phase 2-5**: Internal refactors only

- Changes confined to `src/` internals
- Public API (Express routes) unchanged
- Config schema backward compatible

### **Phase 5**: Version bump to v2.0 if needed

- If any breaking changes, document clearly
- Provide migration guide
- Support v1 config format with deprecation warning

---

## 📊 Success Metrics

### **Code Quality**

- [ ] TypeScript errors: 0
- [ ] ESLint warnings: < 10
- [ ] Test coverage: >80% lines, >90% core logic
- [ ] Cyclomatic complexity avg: < 10 per function

### **Performance**

- [ ] Startup time (20 servers): < 10s (currently unknown baseline)
- [ ] Memory usage: < 150MB for 20 servers
- [ ] Request latency p99: < 100ms
- [ ] Health check overhead: < 5% CPU

### **Developer Experience**

- [ ] Local dev setup: < 30 minutes
- [ ] Build times: < 10s
- [ ] Test suite: < 2 minutes
- [ ] Debugging: request ID traceability

### **Operational**

- [ ] Uptime: 99.9% (no crashes)
- [ ] Mean time to recovery (MTTR): < 1 minute (auto-restart)
- [ ] Log clarity: PII redacted, structured JSON
- [ ] Incident response: < 30 minutes with metrics

---

## 🚨 Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking existing deployments | High | Medium | Keep v1 stable, branch v2, extensive testing |
| Performance regression | Medium | Low | Benchmark before/after each phase |
| Supergateway dependency issues | Medium | Medium | Transport abstraction isolates risk |
| Testing flakiness | Low | Medium | Use test fixtures, mock external systems |
| Migration effort for users | Medium | High | Provide automated migration tools if needed |
| Contributor adoption | Medium | Medium | Clear docs, incremental changes |

---

## 📦 Deliverables per Phase

### Phase 1

- Domain models created
- ProcessManager extracted
- Hot-reload bug fixed
- Graceful shutdown improved
- Port allocator with release
- Error middleware
- Request ID tracking
- **Tag**: `refactor/phase-1-complete`

### Phase 2

- HealthChecker class
- HTTP client abstraction
- Config cache
- Event bus
- DI container
- Refactored ServerManager
- **Tag**: `refactor/phase-2-complete`

### Phase 3

- Transport abstraction
- SuperGatewayTransport
- DirectStdioTransport
- TransportFactory
- Config schema update
- **Tag**: `refactor/phase-3-complete`

### Phase 4

- Vitest configured
- Mock infrastructure
- Unit tests for all core classes
- Integration tests
- CI pipeline with coverage
- **Tag**: `refactor/phase-4-complete`

### Phase 5

- Metrics endpoint
- Compression
- Timeouts
- Rate limiting
- Audit logging
- **Tag**: `refactor/phase-5-complete`

### Phase 6

- Updated architecture docs
- Docker/K8s deployment guides
- Enhanced troubleshooting
- Upgrade guide
- Performance tuning guide
- **Tag**: `refactor/docs-complete`

---

## 🎯 Quick Wins (Can Do Anytime)

These are low-effort, high-value improvements that don't require major refactoring:

1. **Add health check to management API** (already have `/health` but enhance with server stats)
2. **Add request/response logging middleware** (with correlation ID, PII redaction)
3. **Add config validation on startup** (fail fast with clear messages)
4. **Add rate limiting stub** (in-memory, configurable)
5. **Add Prometheus metrics** (simple counters/histograms)
6. **Add graceful degradation** (if supergateway missing, return helpful error)
7. **Add request size limits** (prevent DoS)
8. **Add CORS config option** for gateway (if needed for browser clients)
9. **Add structured error responses** (consistent format: `{ error: string, code?: string, details?: any }`)
10. **Add Dockerfile** (even if not in Phase 5, useful for testing)

---

## 📚 Related Documentation

Keep these docs updated during refactoring:

- `docs/architecture.md` - Update after each phase
- `docs/development.md` - Add testing instructions, debugging tips
- `docs/api-reference.md` - Add new endpoints (metrics, health enhancements)
- `docs/configuration.md` - Document new config options (transport, healthCheck)
- `docs/deployment-*.md` - Add after Phase 5

---

## 🔧 Implementation Checklist

Before starting any phase:

- [ ] Read current relevant modules thoroughly
- [ ] Identify test scenarios for the changes
- [ ] Add todos to daily plan in `memory/YYYY-MM-DD.md`
- [ ] Create feature branch: `refactor/phase-X-description`
- [ ] Run existing build to establish baseline
- [ ] Document any assumptions or questions
- [ ] Consider backward compatibility
- [ ] Plan rollback strategy

After completing a task:

- [ ] Update `docs/` if public API/behavior changed
- [ ] Run full build: `npm run build`
- [ ] Run tests: `npm test` (if tests exist for that phase)
- [ ] Manual smoke test with real servers
- [ ] Commit with conventional commit: `feat(domain): add MCPServer class`
- [ ] Push branch and create draft PR
- [ ] Update this plan (mark task complete with date)
- [ ] Notify team/human if applicable

---

## 📞 Coordination

**Who**: You (the assistant) and the human maintainer
**How**:

- Daily sync on progress
- PRs for each phase (not per task)
- Test in staging environment before merge
- Tag releases after each phase

**Communication**:

- Update `memory/YYYY-MM-DD.md` daily
- Create issues in GitHub for any blockers
- Keep docs in sync with implementation

---

**Let's build a more maintainable oh-my-mcp!**
