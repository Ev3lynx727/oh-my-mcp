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
  remoteClients?: Map<string, RemoteClient>
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

    try {
      switch (body.method) {
        case "initialize":
          return await handleInitialize(req, res, manager, remoteClients, sessionManager, toolCatalog, body);
        case "tools/list":
          return await handleToolsList(res, manager, remoteClients, sessionManager, toolCatalog, sessionId, body);
        case "tools/call":
          return await handleToolsCall(res, sessionManager, sessionId, body);
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
  // Build fresh backend map from all running servers + remote clients
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

  // Add remote clients
  if (remoteClients) {
    for (const [id, client] of remoteClients) {
      if (client.isHealthy()) {
        backends.set(id, client);
      }
    }
  }

    const tools = await toolCatalog.getAllTools(backends);

  res.status(200).json({
    jsonrpc: "2.0",
    result: { tools },
    id: body.id ?? null,
  });
}

async function handleToolsCall(
  res: Response,
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
    if (!session) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or expired session" },
        id: body.id ?? null,
      });
      return;
    }
    backends = session.backends as Map<string, BackendClient>;
  }

  if (!backends) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Session required for tools/call (send initialize first)" },
      id: body.id ?? null,
    });
    return;
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
