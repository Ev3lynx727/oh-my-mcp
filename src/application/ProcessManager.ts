import { spawn, ChildProcess } from "child_process";
import { getLogger } from "../logger.js";
import { MCPServer } from "../domain/Server.js";
import type { ServerConfig as LegacyServerConfig } from "../config.js";

const logger = getLogger();

export class ProcessManager {
  private runningProcesses: Map<string, ChildProcess> = new Map();

  /**
   * Start a server process for the given MCPServer using its configuration.
   *
   * @param server - The domain MCPServer instance (will have state updated externally)
   * @param legacyConfig - Legacy ServerConfig containing command, env, timeout
   * @param port - The port to assign to this server (and pass to supergateway)
   */
  async startServer(server: MCPServer, legacyConfig: LegacyServerConfig, port: number): Promise<void> {
    const id = server.id;
    const existing = this.runningProcesses.get(id);
    if (existing) {
      logger.warn({ server: id }, "Process already running, not starting again");
      return;
    }

    const env = this.resolveEnv(legacyConfig.env || {});
    const mergedEnv = { ...process.env, ...env };

    const stdioCmd = legacyConfig.command.join(" ");

    const args = [
      "-y",
      "supergateway",
      "--stdio",
      stdioCmd,
      "--outputTransport",
      "streamableHttp",
      "--port",
      port.toString(),
    ];

    logger.info({ server: id, port, command: legacyConfig.command, args }, "Starting server process");

    const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", args, {
      env: mergedEnv,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.runningProcesses.set(id, child);

    child.stdout?.on("data", (data) => {
      logger.debug({ server: id, type: "stdout" }, data.toString().trim());
    });

    child.stderr?.on("data", (data) => {
      const msg = data.toString().trim();
      logger.info({ server: id, type: "stderr" }, msg);
      // Also emit via ServerManager's log event (handled separately)
    });

    child.on("error", (err) => {
      logger.error({ server: id, error: err.message }, "Server process error");
      this.runningProcesses.delete(id);
    });

    child.on("exit", (code) => {
      logger.info({ server: id, code }, "Server process exited");
      this.runningProcesses.delete(id);
    });
  }

  /**
   * Stop the server process for the given MCPServer.
   *
   * @param server - The domain MCPServer instance
   */
  async stopServer(server: MCPServer): Promise<void> {
    const id = server.id;
    const child = this.runningProcesses.get(id);
    if (!child) {
      logger.debug({ server: id }, "No process to stop");
      return;
    }

    logger.info({ server: id }, "Stopping server process");
    child.kill("SIGTERM");

    // Wait a moment for graceful exit, then force kill if needed
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (!child.killed) {
      logger.warn({ server: id }, "Process still alive, sending SIGKILL");
      child.kill("SIGKILL");
    }

    this.runningProcesses.delete(id);
  }

  /**
   * Restart the server process (stop then start).
   *
   * @param server - The domain MCPServer instance
   * @param legacyConfig - Legacy ServerConfig for start
   */
  async restartServer(server: MCPServer, legacyConfig: LegacyServerConfig): Promise<void> {
    const id = server.id;
    await this.stopServer(server);
    // Small backoff before restart
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // Use the server's current port (should be set after previous start)
    const port = server.getPort();
    await this.startServer(server, legacyConfig, port);
  }

  /**
   * Check if a process is currently running for the given server ID.
   */
  isRunning(id: string): boolean {
    return this.runningProcesses.has(id);
  }

  /**
   * Get the ChildProcess for a server ID (if running).
   */
  getProcess(id: string): ChildProcess | undefined {
    return this.runningProcesses.get(id);
  }

  /**
   * Stop all managed processes.
   */
  async stopAll(): Promise<void> {
    for (const [id, child] of this.runningProcesses) {
      logger.info({ server: id }, "Stopping process during shutdown");
      child.kill("SIGTERM");
    }
    this.runningProcesses.clear();
  }

  private resolveEnv(env: Record<string, string | undefined>): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (value) {
        if (value.startsWith("{env:") && value.endsWith("}")) {
          const envVar = value.slice(5, -1);
          resolved[key] = process.env[envVar] || "";
        } else {
          resolved[key] = value;
        }
      }
    }
    return resolved;
  }
}
