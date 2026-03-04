export interface LogEntry {
  level: string;
  messages: any[];
  timestamp?: Date;
}

/**
 * Mock logger for testing.
 *
 * Captures log calls for inspection, and can optionally also output to console.
 */
export class MockLogger {
  private logs: LogEntry[] = [];

  debug(...messages: any[]): void {
    this.log('debug', messages);
  }

  info(...messages: any[]): void {
    this.log('info', messages);
  }

  warn(...messages: any[]): void {
    this.log('warn', messages);
  }

  error(...messages: any[]): void {
    this.log('error', messages);
  }

  private log(level: string, messages: any[]): void {
    this.logs.push({ level, messages, timestamp: new Date() });
  }

  /**
   * Get all captured logs.
   */
  getLogs(): LogEntry[] {
    return this.logs;
  }

  /**
   * Clear captured logs.
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Assert that a message with given level and containing expected text exists.
   */
  assertHas(level: string, expectedSubstring: string): void {
    const found = this.logs.some((entry) => {
      if (entry.level !== level) return false;
      return entry.messages.some((msg) => {
        const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
        return str.includes(expectedSubstring);
      });
    });
    if (!found) {
      throw new Error(`Expected log with level ${level} containing "${expectedSubstring}" but not found. Logs: ${JSON.stringify(this.logs)}`);
    }
  }

  /**
   * Assert that no logs at given level exist.
   */
  assertNone(level: string): void {
    const found = this.logs.filter((entry) => entry.level === level);
    if (found.length > 0) {
      throw new Error(`Expected no logs at level ${level} but found ${found.length}. Logs: ${JSON.stringify(this.logs)}`);
    }
  }
}
