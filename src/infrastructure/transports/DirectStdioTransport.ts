import { ChildProcess } from "child_process";
import { MCPServer } from "../../domain/Server.js";
import { ServerTransport } from "../../domain/Transport.js";

export class DirectStdioTransport implements ServerTransport {
  usesPort(): boolean {
    return false;
  }

  getEndpoint(_server: MCPServer): string {
    return "stdio";
  }

  async isReady(server: MCPServer, timeoutMs?: number): Promise<boolean> {
    const proc = server.getProcess();
    if (!proc?.stdin) return false;
    try {
      await this.sendJsonRpc(proc, {
        jsonrpc: "2.0",
        id: "init",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "oh-my-mcp", version: "1.0.0" },
        },
      }, timeoutMs ?? 30000);
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(server: MCPServer): Promise<boolean> {
    const proc = server.getProcess();
    if (!proc?.stdin) return false;
    try {
      await this.sendJsonRpc(proc, {
        jsonrpc: "2.0",
        id: "health",
        method: "tools/list",
        params: {},
      }, server.getTimeout());
      return true;
    } catch {
      return false;
    }
  }

  async sendRequest(server: MCPServer, request: any): Promise<any> {
    const proc = server.getProcess();
    if (!proc?.stdin) {
      throw new Error(`Server ${server.id} has no process`);
    }
    return this.sendJsonRpc(proc, request, server.getTimeout());
  }

  private sendJsonRpc(proc: ChildProcess, request: any, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = request.id;
      let buffer = "";

      const onData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.id === requestId) {
              cleanup();
              resolve(parsed);
              return;
            }
          } catch {
            // incomplete JSON, keep buffering
          }
        }
      };

      const onExit = () => {
        cleanup();
        reject(new Error(`Process exited before responding to JSON-RPC request ${requestId}`));
      };

      const cleanup = () => {
        proc.stdout?.removeListener("data", onData);
        proc.removeListener("exit", onExit);
        clearTimeout(timer);
      };

      const timer = setTimeout(() => {
        proc.stdout?.removeListener("data", onData);
        proc.removeListener("exit", onExit);
        reject(new Error(`JSON-RPC request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stdout?.on("data", onData);
      proc.on("exit", onExit);
      proc.stdin!.write(JSON.stringify(request) + "\n");
    });
  }
}
