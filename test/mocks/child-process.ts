import { EventEmitter } from 'events';

export interface MockChildProcessOptions {
  id?: string;
  exitCode?: number;
  autoExit?: boolean;
}

/**
 * Mock ChildProcess for testing.
 *
 * Provides controllable behavior for stdout, stderr, exit, and error events.
 */
export class MockChildProcess extends EventEmitter {
  public readonly id: string;
  public exitCode: number | null = null;
  public autoExit: boolean;
  public killed = false;
  public stdinClosed = false;

  private _stdout: string = '';
  private _stderr: string = '';

  constructor(options: MockChildProcessOptions = {}) {
    super();
    this.id = options.id || 'mock-child';
    this.exitCode = options.exitCode ?? null;
    this.autoExit = options.autoExit ?? false;
  }

  get stdoutBuffer(): string {
    return this._stdout;
  }

  get stderrBuffer(): string {
    return this._stderr;
  }

  // Simulate writing to stdout/stderr (what the child process emits)
  mockStdout(data: string | Buffer): void {
    const str = data instanceof Buffer ? data.toString('utf8') : data;
    this._stdout += str;
    this.emit('data', str);
  }

  mockStderr(data: string | Buffer): void {
    const str = data instanceof Buffer ? data.toString('utf8') : data;
    this._stderr += str;
    this.emit('data', str);
  }

  // Simulate process exiting
  exit(code?: number): void {
    this.exitCode = code ?? 0;
    this.emit('exit', this.exitCode);
  }

  // Simulate error event
  emitError(err: Error): void {
    this.emit('error', err);
  }

  kill(signal?: string): void {
    this.killed = true;
    if (this.autoExit) {
      this.exit(signal === 'SIGKILL' ? 9 : 1);
    }
  }

  disconnect(): void {
    this.removeAllListeners();
  }
}

/**
 * Factory for creating a pair of mock child processes (stdin/stdout pipes)
 * Not needed for simple process mocks; this is for more complex scenarios.
 */
export function createMockChildProcessPair() {
  let child: MockChildProcess;
  let parentWriteStream: { write: (data: any) => void };
  let parentReadStream: { on: (event: string, cb: (data: any) => void) => void };

  // Simplified: just return a child process; parent-side I/O can be handled differently
  return child;
}
