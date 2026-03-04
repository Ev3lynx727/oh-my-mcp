# Upgrade Guide

This document describes how to upgrade oh-my-mcp between versions and notes breaking changes.

---

## General Procedure

1. **Backup** your current configuration (`config.yaml`) and any persisted state (not currently used, but backup is safe).
2. **Review** the release changelog for breaking changes.
3. **Update** the binary or Docker image to the new version.
   - Binary: replace the executable.
   - Docker: pull the new image tag.
4. **Check config compatibility**: run `node dist/index.js /path/to/config.yaml` to validate; it will exit with non-zero if invalid.
5. **Restart** the service.
6. **Verify** health endpoint (`/health`) and that expected servers are RUNNING.

---

## Version-Specific Notes

### v0.1.0 → v0.2.0 (Domain Layer & DI)

- **Breaking change**: The internal architecture was refactored; configuration schema unchanged at top-level but added fields:
  - `servers.*.transport` (default `"supergateway"`)
  - `servers.*.healthCheck` (object with `interval`, `timeout`, `unhealthyThreshold`)
  - Top-level `compression: boolean` (default true)
- Existing configs without these keys continue to work (defaults applied).
- No public API changes; the gateway and management endpoints remain the same.

### v0.2.0 → v0.3.0 (Metrics & Logging)

- **New endpoint**: `/metrics` on both management and gateway ports (already present).
- **New middleware**: Rate limiting applied by default:
  - Management: 100 req/min per IP
  - Gateway: 1000 req/min per token
  If you rely on high unratelimited traffic, adjust limits by forking or future config.
- **Audit logging**: Management state changes are now logged with `component: "audit"`.
- No breaking changes to core JSON-RPC proxy.

---

## Migration Checklist

- [ ] Backup config
- [ ] Read release notes (GitHub Releases)
- [ ] Update binary/image
- [ ] Validate config (`node dist/index.js config.yaml` will exit 1 on invalid)
- [ ] Restart service
- [ ] Check `/health` and `/servers`
- [ ] Verify client connectivity

---

## Rolling Back

If the new version breaks functionality:

- Revert to the previous binary/image.
- Restore previous config if you modified it.
- Restart the service.
- Capture logs and open an issue.

---

## Database / Persistent State

oh-my-mcp does not use a database; all state is in memory. No migrations required.

---

## Future Compatibility

We aim to maintain backward compatibility for the public API (management and gateway endpoints). Internal architectural changes should not affect clients as long as endpoints behave as documented.

Breaking changes will be clearly marked in the changelog and this guide.
