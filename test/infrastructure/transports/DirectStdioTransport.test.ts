import { describe, it, expect } from "vitest";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { DirectStdioTransport } from "../../../src/infrastructure/transports/DirectStdioTransport.js";

function makeMockProcess() {
  const proc = new EventEmitter() as any;
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();

  proc.stdin.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const req = JSON.parse(line);
        const res = { jsonrpc: "2.0", id: req.id, result: { ok: true } };
        proc.stdout.write(JSON.stringify(res) + "\n");
      } catch {
        // not JSON, ignore
      }
    }
  });

  return proc;
}

function makeMockServer(overrides: any = {}) {
  return {
    id: "test",
    getProcess: () => makeMockProcess(),
    getTimeout: () => 5000,
    ...overrides,
  } as any;
}

describe("DirectStdioTransport", () => {
  it("usesPort returns false", () => {
    expect(new DirectStdioTransport().usesPort()).toBe(false);
  });

  it("getEndpoint returns stdio", () => {
    expect(new DirectStdioTransport().getEndpoint(null as any)).toBe("stdio");
  });

  it("isReady returns true when initialize responds", async () => {
    const transport = new DirectStdioTransport();
    const server = makeMockServer();
    const ready = await transport.isReady(server, 5000);
    expect(ready).toBe(true);
  });

  it("isReady returns false when no process", async () => {
    const transport = new DirectStdioTransport();
    const server = makeMockServer({ getProcess: () => undefined });
    const ready = await transport.isReady(server, 500);
    expect(ready).toBe(false);
  });

  it("healthCheck returns true when tools/list responds", async () => {
    const transport = new DirectStdioTransport();
    const server = makeMockServer();
    const healthy = await transport.healthCheck(server);
    expect(healthy).toBe(true);
  });

  it("healthCheck returns false when no process", async () => {
    const transport = new DirectStdioTransport();
    const server = makeMockServer({ getProcess: () => undefined });
    const healthy = await transport.healthCheck(server);
    expect(healthy).toBe(false);
  });

  it("sendRequest writes JSON-RPC and reads response", async () => {
    const transport = new DirectStdioTransport();
    const server = makeMockServer();
    const result = await transport.sendRequest(server, {
      jsonrpc: "2.0",
      id: "req-1",
      method: "tools/list",
      params: {},
    });
    expect(result).toEqual({
      jsonrpc: "2.0",
      id: "req-1",
      result: { ok: true },
    });
  });

  it("sendRequest rejects when timeout expires", async () => {
    const transport = new DirectStdioTransport();
    const quietProc = new EventEmitter() as any;
    quietProc.stdin = new PassThrough();
    quietProc.stdout = new PassThrough();
    // never write to stdout

    const server = makeMockServer({ getProcess: () => quietProc, getTimeout: () => 50 });
    await expect(
      transport.sendRequest(server, { jsonrpc: "2.0", id: 1, method: "test", params: {} })
    ).rejects.toThrow("timed out");
  });

  it("sendRequest rejects when process exits before responding", async () => {
    const transport = new DirectStdioTransport();
    const exitProc = new EventEmitter() as any;
    exitProc.stdin = new PassThrough();
    exitProc.stdout = new PassThrough();

    const server = makeMockServer({ getProcess: () => exitProc, getTimeout: () => 5000 });
    const promise = transport.sendRequest(server, { jsonrpc: "2.0", id: 1, method: "test", params: {} });
    exitProc.emit("exit", 1);
    await expect(promise).rejects.toThrow("exited before responding");
  });

  it("sendRequest throws when no process", async () => {
    const transport = new DirectStdioTransport();
    const server = makeMockServer({ getProcess: () => undefined });
    await expect(
      transport.sendRequest(server, { jsonrpc: "2.0", id: 1, method: "test", params: {} })
    ).rejects.toThrow("has no process");
  });
});
