import express, { Request, Response } from "express";
import { randomBytes } from "crypto";
import { ServerManager } from "../../server_manager.js";
import { BackendClient, SimpleBackendClient } from "../../domain/BackendClient.js";
import { RemoteClient } from "../transports/RemoteClient.js";
import { ToolCatalog } from "../../application/ToolCatalog.js";
import { SessionManager } from "../../application/SessionManager.js";
import { getLogger } from "../../logger.js";

const logger = getLogger();

/**
 * McpHost implements the MCP streamableHttp protocol.
 *
 * Single endpoint: POST /mcp/server
 * - initialize: create session, fan-out init to all backends
 * - tools/list: aggregated tool catalog with serverId__ prefix
 * - tools/call: route to correct backend by prefix
 *
 * GET /mcp/server returns 405 (M0 — no SSE stream).
 * Full SSE support planned for M2.
 */
export function createMcpHost(
  manager: ServerManager,
  remoteClients?: Map<string, RemoteClient>,
  exposeTools: boolean = true
): express.Router {
  const router = express.Router();
  const sessionManager = new SessionManager();
  const toolCatalog = new ToolCatalog();

  // GET not supported in M0
  router.get("/mcp/server", (_req: Request, res: Response) => {
    res.status(405).json({
      error: "SSE stream not supported in M0. Use POST for JSON-RPC.",
    });
  });

  router.post("/mcp/server", async (req: Request, res: Response) => {
    const body = req.body;
    if (!body || !body.method) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid Request: missing method" },
        id: body?.id ?? null,
      });
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    // Accept MCP notifications (fire-and-forget, no id) — e.g. notifications/initialized
    if (body.id === undefined && typeof body.method === "string" && body.method.startsWith("notifications/")) {
      res.status(202).end();
      return;
    }

    try {
      switch (body.method) {
        case "initialize":
          return await handleInitialize(req, res, manager, remoteClients, sessionManager, toolCatalog, body);
        case "tools/list":
          if (!exposeTools) {
            res.status(200).json({ jsonrpc: "2.0", result: { tools: [] }, id: body.id ?? null });
            return;
          }
          return await handleToolsList(res, manager, remoteClients, sessionManager, toolCatalog, sessionId, body);
        case "tools/call":
          if (!exposeTools) {
            res.status(400).json({ jsonrpc: "2.0", error: { code: -32601, message: "Tools not exposed (mcpHost.exposeTools=false)" }, id: body.id ?? null });
            return;
          }
          return await handleToolsCall(res, manager, remoteClients, sessionManager, sessionId, body);
        default:
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32601, message: `Method not found: ${body.method}` },
            id: body.id ?? null,
          });
          return;
      }
    } catch (err: any) {
      logger.error({ method: body.method, error: err.message }, "McpHost request failed");
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: err.message },
        id: body.id ?? null,
      });
    }
  });

  return router;
}

/**
 * Build (and lazily initialize) the set of live backend clients for all
 * currently running servers + remote clients. Backend sessions are
 * established once via a fan-out initialize and cached, so they survive
 * across client sessions — including daemon restarts that wipe the
 * in-memory SessionManager state. Returns the cached map on later calls.
 *
 * Known limitation: the cache is rebuilt only on a full daemon restart
 * (module reload). An individual backend that dies and restarts mid-run
 * will keep a stale client in the cache until the next daemon restart.
 */
let liveBackendsCache: Map<string, BackendClient> | null = null;

async function getLiveBackends(
  manager: ServerManager,
  remoteClients: Map<string, RemoteClient> | undefined
): Promise<Map<string, BackendClient>> {
  if (liveBackendsCache && liveBackendsCache.size > 0) {
    return liveBackendsCache;
  }

  const backends = new Map<string, BackendClient>();
  for (const srv of manager.getAllServers()) {
    if (srv.status !== "running") continue;
    const domain = manager.getDomainServer(srv.id);
    const transport = manager.getTransport(srv.id);
    if (domain && transport) {
      backends.set(srv.id, new SimpleBackendClient(srv.id, domain, transport));
    }
  }
  if (remoteClients) {
    for (const [id, client] of remoteClients) {
      if (client.isHealthy()) {
        backends.set(id, client);
      }
    }
  }

  if (backends.size > 0) {
    // Fan-out initialize so each (stateful) backend has a live session in its
    // shared transport. Without this, tool calls return HTTP 400 "No valid
    // session ID provided".
    const initRequest = {
      jsonrpc: "2.0",
      id: "host-init",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "oh-my-mcp-host", version: "1.2.0" },
      },
    };
    await Promise.allSettled(
      Array.from(backends.values()).map((client) => client.sendRequest(initRequest))
    );
  }

  liveBackendsCache = backends;
  return backends;
}

async function handleInitialize(
  req: Request,
  res: Response,
  manager: ServerManager,
  remoteClients: Map<string, RemoteClient> | undefined,
  sessionManager: SessionManager,
  toolCatalog: ToolCatalog,
  body: any
): Promise<void> {
  // Build backend clients for all running servers + remote clients
  const backends = new Map<string, BackendClient>();
  const servers = manager.getAllServers();

  for (const srv of servers) {
    if (srv.status !== "running") continue;
    const domain = manager.getDomainServer(srv.id);
    const transport = manager.getTransport(srv.id);
    if (domain && transport) {
      backends.set(srv.id, new SimpleBackendClient(srv.id, domain, transport));
    }
  }

  // Add remote clients (connected at startup)
  if (remoteClients) {
    for (const [id, client] of remoteClients) {
      if (client.isHealthy()) {
        backends.set(id, client);
      }
    }
  }

  if (backends.size === 0) {
    res.status(503).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "No running backends available" },
      id: body.id ?? null,
    });
    return;
  }

  // Fan-out initialize to all backends. The host initializes each backend on
  // its own behalf, so it always sends a complete params with clientInfo —
  // the MCP SDK rejects initialize requests missing clientInfo with HTTP 400.
  const initRequest = {
    jsonrpc: "2.0",
    id: "host-init",
    method: "initialize",
    params: {
      protocolVersion: body.params?.protocolVersion ?? "2024-11-05",
      capabilities: body.params?.capabilities ?? {},
      clientInfo: body.params?.clientInfo ?? { name: "oh-my-mcp-host", version: "1.2.0" },
    },
  };

  const results = await Promise.allSettled(
    Array.from(backends.values()).map((client) => client.sendRequest(initRequest))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  if (succeeded === 0) {
    res.status(503).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: `All ${backends.size} backend initializations failed` },
      id: body.id ?? null,
    });
    return;
  }

  // Create session
  const sessionId = randomBytes(16).toString("hex");
  sessionManager.createSession(sessionId, backends);

  // Invalidate tool catalog to pick up newly initialized backends
  toolCatalog.invalidate();

  logger.info({ sessionId, backends: backends.size, succeeded, failed }, "McpHost session initialized");

  res.setHeader("Mcp-Session-Id", sessionId);
  res.status(200).json({
    jsonrpc: "2.0",
    result: {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: "oh-my-mcp-host",
        version: "1.2.0",
      },
    },
    id: body.id ?? null,
  });
}

async function handleToolsList(
  res: Response,
  manager: ServerManager,
  remoteClients: Map<string, RemoteClient> | undefined,
  sessionManager: SessionManager,
  toolCatalog: ToolCatalog,
  sessionId: string | undefined,
  body: any
): Promise<void> {
  // Build (and initialize) live backends. Uses a cached map so backend
  // sessions are established once and reused — this also lets tools/list work
  // without a client session, staying resilient to daemon restarts.
  const backends = await getLiveBackends(manager, remoteClients);

    const tools = await toolCatalog.getAllTools(backends);

  res.status(200).json({
    jsonrpc: "2.0",
    result: { tools },
    id: body.id ?? null,
  });
}

async function handleToolsCall(
  res: Response,
  manager: ServerManager,
  remoteClients: Map<string, RemoteClient> | undefined,
  sessionManager: SessionManager,
  sessionId: string | undefined,
  body: any
): Promise<void> {
  const toolName = body.params?.name;
  if (!toolName) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32602, message: "Missing tool name" },
      id: body.id ?? null,
    });
    return;
  }

  // Parse namespaced name: serverId__toolName
  const separatorIndex = toolName.indexOf("__");
  if (separatorIndex === -1) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32602,
        message: `Invalid tool name format: ${toolName}. Expected serverId__toolName`,
      },
      id: body.id ?? null,
    });
    return;
  }

  const serverId = toolName.substring(0, separatorIndex);
  const actualToolName = toolName.substring(separatorIndex + 2);

  // Resolve session or use all running backends
  let backends: Map<string, BackendClient> | undefined;

  if (sessionId) {
    const session = sessionManager.getSession(sessionId);
    if (session) {
      backends = session.backends as Map<string, BackendClient>;
    } else {
      // Session invalid/expired (e.g. daemon restarted and wiped in-memory sessions).
      // Fall through and use live backends instead of failing the call.
      logger.warn({ sessionId }, "Session invalid/expired (daemon restart?) — falling back to live backends");
    }
  }

  if (!backends) {
    // No (valid) session: use the cached live backends. getLiveBackends builds
    // and initializes them once, so tool calls keep working across daemon
    // restarts that wipe in-memory client sessions.
    backends = await getLiveBackends(manager, remoteClients);
  }

  const client = backends.get(serverId);
  if (!client) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32602,
        message: `Unknown server: ${serverId}`,
      },
      id: body.id ?? null,
    });
    return;
  }

  // Route request to the correct backend with the original tool name
  const backendRequest = {
    jsonrpc: "2.0",
    id: body.id ?? `call-${Date.now()}`,
    method: "tools/call",
    params: {
      name: actualToolName,
      arguments: body.params?.arguments ?? {},
    },
  };

  const result = await client.sendRequest(backendRequest);

  res.status(200).json({
    jsonrpc: "2.0",
    result: result.result,
    id: body.id ?? null,
  });
}
