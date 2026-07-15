import { z } from "zod";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { randomBytes } from "crypto";
import { join } from "path";

export async function ensureAuthToken(auth?: AuthConfig): Promise<AuthConfig | undefined> {
  if (!auth || !auth.autoGenerate || (auth.tokens && auth.tokens.length > 0) || auth.token) {
    return auth;
  }
  const dir = join(homedir(), ".config", "oh-my-mcp");
  const filePath = join(dir, "auth-token");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  let token: string;
  if (existsSync(filePath)) {
    token = (await readFile(filePath, "utf-8")).trim();
  } else {
    token = randomBytes(32).toString("hex");
    await writeFile(filePath, token, "utf-8");
  }
  return { tokens: [token] };
}

export const ServerConfigSchema = z.object({
  command: z.array(z.string()),
  env: z.record(z.string()).optional(),
  timeout: z.number().optional().default(60000),
  port: z.number().optional(),
  enabled: z.boolean().optional().default(true),
  transport: z.enum(["supergateway", "stdio"]).optional().default("supergateway"),
  cacheTtl: z.number().nonnegative().optional(),
  healthCheck: z
    .object({
      interval: z.number().optional().default(30000),
      timeout: z.number().optional().default(5000),
      unhealthyThreshold: z.number().optional().default(3),
    })
    .optional(),
  sessionTimeout: z.number().positive().optional(),
});

export const AuthConfigSchema = z.object({
  token: z.string().optional(),
  tokens: z.array(z.string()).optional(),
  autoGenerate: z.boolean().optional(),
});

export const McpHostConfigSchema = z.object({
  enabled: z.boolean().optional().default(false),
  sessionTimeout: z.number().positive().optional().default(300000),
  toolCatalogTtl: z.number().nonnegative().optional().default(60000),
});

export const ConfigSchema = z.object({
  servers: z.record(ServerConfigSchema),
  auth: AuthConfigSchema.optional(),
  mcpHost: McpHostConfigSchema.optional(),
  managementPort: z.number().optional().default(8080),
  gatewayPort: z.number().optional().default(8090),
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
  compression: z.boolean().optional().default(true),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export type ServerStatus = "stopped" | "starting" | "running" | "error";

export interface ServerState {
  id: string;
  name: string;
  config: ServerConfig;
  status: ServerStatus;
  port: number;
  process?: any;
  error?: string;
  startedAt?: Date;
  health?: {
    ok: boolean;
    lastCheck: Date;
  };
}

export interface MCPServerInfo {
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: any;
  }>;
  resources?: Array<{
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
  }>;
  prompts?: Array<{
    name: string;
    description?: string;
  }>;
}
