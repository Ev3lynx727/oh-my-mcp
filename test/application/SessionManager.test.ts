import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/application/SessionManager.js';
import type { BackendClient } from '../../src/domain/BackendClient.js';

function mockBackend(id: string): BackendClient {
  return {
    serverId: id,
    sendRequest: vi.fn(),
    isHealthy: vi.fn().mockReturnValue(true),
    close: vi.fn(),
  };
}

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SessionManager(300_000); // 5min default
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  it('creates and retrieves a session', () => {
    const backends = new Map([['srv1', mockBackend('srv1')]]);
    manager.createSession('sess-1', backends);

    const session = manager.getSession('sess-1');
    expect(session).toBeDefined();
    expect(session!.id).toBe('sess-1');
    expect(session!.backends.size).toBe(1);
    expect(manager.size).toBe(1);
  });

  it('returns undefined for unknown session', () => {
    expect(manager.getSession('nope')).toBeUndefined();
  });

  it('deletes a session', () => {
    const backends = new Map([['srv1', mockBackend('srv1')]]);
    manager.createSession('sess-1', backends);

    const deleted = manager.deleteSession('sess-1');
    expect(deleted).toBe(true);
    expect(manager.size).toBe(0);
    expect(manager.getSession('sess-1')).toBeUndefined();
  });

  it('returns false when deleting nonexistent session', () => {
    expect(manager.deleteSession('nope')).toBe(false);
  });

  it('expires session after timeout', () => {
    const backends = new Map([['srv1', mockBackend('srv1')]]);
    manager.createSession('sess-1', backends, 1000); // 1s timeout

    // Past timeout without accessing — session expired
    vi.advanceTimersByTime(1001);
    expect(manager.getSession('sess-1')).toBeUndefined();
    expect(manager.size).toBe(0);
  });

  it('updates lastActive on getSession', () => {
    const backends = new Map([['srv1', mockBackend('srv1')]]);
    manager.createSession('sess-1', backends, 1000);

    // Access at t=500 — resets lastActive to 500
    vi.advanceTimersByTime(500);
    manager.getSession('sess-1');

    // 800ms later (t=1300) — 1300-500=800 < 1000, still alive
    vi.advanceTimersByTime(800);
    expect(manager.getSession('sess-1')).toBeDefined();

    // Access just updated lastActive to 1300; now advance past timeout
    // 1001ms after last access → expired
    vi.advanceTimersByTime(1001);
    expect(manager.getSession('sess-1')).toBeUndefined();
  });

  it('copies backends map on create (no shared reference)', () => {
    const backends = new Map([['srv1', mockBackend('srv1')]]);
    manager.createSession('sess-1', backends);

    // Mutate original
    backends.set('srv2', mockBackend('srv2'));
    const session = manager.getSession('sess-1');
    expect(session!.backends.size).toBe(1); // not affected
  });

  it('background cleanup removes expired sessions', () => {
    const backends = new Map([['srv1', mockBackend('srv1')]]);
    manager.createSession('sess-1', backends, 1000);

    // Advance past timeout + cleanup interval (30s)
    vi.advanceTimersByTime(31_000);
    expect(manager.size).toBe(0);
  });

  it('destroy stops cleanup interval', () => {
    manager.destroy();
    // No error on double destroy
    manager.destroy();
  });

  it('multiple sessions with different timeouts', () => {
    const backends = new Map([['srv1', mockBackend('srv1')]]);
    manager.createSession('short', backends, 1000);
    manager.createSession('long', backends, 10_000);

    vi.advanceTimersByTime(5000);
    expect(manager.getSession('short')).toBeUndefined();
    expect(manager.getSession('long')).toBeDefined();
  });
});
