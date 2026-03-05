import express, { Request, Response, NextFunction } from "express";
import { ServerManager } from "./server_manager.js";
import { getLogger } from "./logger.js";
import http from "http";

const logger = getLogger();

export function createGatewayAPI(manager: ServerManager) {
  const router = express.Router();

  router.use((req: Request, res: Response, next: NextFunction) => {
    const path = req.path;

    let serverId: string | undefined;

    if (path.startsWith("/mcp/")) {
      serverId = path.split("/")[2];
    } else if (path === "/mcp") {
      serverId = req.headers["x-mcp-server"] as string;
    }

    if (!serverId) {
      return res.status(400).json({ error: "Missing server ID. Use /mcp/:serverId or X-MCP-Server header" });
    }

    const server = manager.getServer(serverId);

    if (!server) {
      return res.status(404).json({ error: `Server '${serverId}' not found` });
    }

    if (server.status !== "running") {
      return res.status(503).json({ error: `Server '${serverId}' is not running (status: ${server.status})` });
    }

    const targetPort = server.port;
    const targetPath = "/mcp";
    
    // Filter headers to remove problematic ones
    const forwardHeaders: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      // Skip connection headers and host header, and skip undefined values
      if (!['host', 'connection', 'content-length', 'transfer-encoding'].includes(key.toLowerCase()) && value !== undefined) {
        forwardHeaders[key] = value;
      }
    }
    
    const options = {
      hostname: "localhost",
      port: targetPort,
      path: targetPath,
      method: req.method,
      headers: forwardHeaders,
      timeout: 60000,  // Increased to 60 seconds for streaming responses
    };

    // Prepare body if present 
    let bodyData: string | null = null;
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      if (req.body) {
        bodyData = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        // Set content-length based on actual body
        const bodyBuffer = Buffer.from(bodyData);
        options.headers['content-length'] = bodyBuffer.length.toString();
      }
    }

    const proxyOptions = {
      ...options,
      headers: {
        ...options.headers,
        host: `localhost:${targetPort}`,
        accept: 'application/json, text/event-stream',
      },
    };

    const proxyReq = http.request(proxyOptions, (proxyRes) => {
      res.status(proxyRes.statusCode || 500);
      Object.keys(proxyRes.headers).forEach(key => {
        const value = proxyRes.headers[key];
        if (value !== undefined) {
          res.setHeader(key, value);
        }
      });
      
      // Direct piping with explicit end
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on("error", (err) => {
      logger.error({ server: serverId, error: err.message }, "Proxy request error");
      if (!res.headersSent) {
        res.status(502).json({ error: "Bad gateway" });
      }
    });

    proxyReq.on("timeout", () => {
      logger.error({ server: serverId }, "Proxy request timeout");
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: "Gateway timeout" });
      }
    });

    // Handle response errors
    res.on('error', (err) => {
      logger.error({ server: serverId, error: err.message }, "Response error");
      proxyReq.destroy();
    });

    // Send body if present
    if (bodyData) {
      proxyReq.write(bodyData);
    }
    proxyReq.end();
  });

  return router;
}
