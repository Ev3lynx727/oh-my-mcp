import { BackendClient } from "../domain/BackendClient.js";
import { getLogger } from "../logger.js";

const logger = getLogger();

export interface Session {
  id: string;
  backends: Map<string, BackendClient>;
  createdAt: number;
  lastActive: number;
  timeoutMs: number;
}

/**
 * SessionManager tracks MCP sessions by Mcp-Session-Id.
 *
 * Each session holds a set of backend clients and timestamps for
 * creation and last activity. Idle sessions are expired based on
 * the configured sessionTimeout.
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private defaultTimeoutMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(defaultTimeoutMs: number = 300000) {
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.startCleanup();
  }

  /**
   * Create a new session with the given id and backend clients.
   */
  createSession(id: string, backends: Map<string, BackendClient>, timeoutMs?: number): Session {
    const session: Session = {
      id,
      backends: new Map(backends),
      createdAt: Date.now(),
      lastActive: Date.now(),
      timeoutMs: timeoutMs ?? this.defaultTimeoutMs,
    };
    this.sessions.set(id, session);
    logger.info({ sessionId: id, backends: backends.size }, "Session created");
    return session;
  }

  /**
   * Get a session by id, updating lastActive timestamp.
   * Returns undefined if session not found or expired.
   */
  getSession(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (this.isExpired(session)) {
      this.deleteSession(id);
      return undefined;
    }
    session.lastActive = Date.now();
    return session;
  }

  /**
   * Delete a session by id.
   */
  deleteSession(id: string): boolean {
    const existed = this.sessions.delete(id);
    if (existed) {
      logger.info({ sessionId: id }, "Session deleted");
    }
    return existed;
  }

  /**
   * Get the total number of active sessions.
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Stop the cleanup interval. Call on shutdown.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private isExpired(session: Session): boolean {
    return Date.now() - session.lastActive > session.timeoutMs;
  }

  private startCleanup(): void {
    // Check every 30s for expired sessions
    this.cleanupInterval = setInterval(() => {
      let expired = 0;
      for (const [id, session] of this.sessions) {
        if (this.isExpired(session)) {
          this.sessions.delete(id);
          expired++;
        }
      }
      if (expired > 0) {
        logger.info({ expired, active: this.sessions.size }, "Expired idle sessions");
      }
    }, 30000);
  }
}
