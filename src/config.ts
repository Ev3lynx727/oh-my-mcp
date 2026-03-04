import { z } from "zod";

export const ServerConfigSchema = z.object({
  command: z.array(z.string()),
  env: z.record(z.string()).optional(),
  timeout: z.number().optional().default(60000),
  port: z.number().optional(),
  enabled: z.boolean().optional().default(true),
  transport: z.enum(["supergateway", "stdio"]).optional().default("supergateway"),
  healthCheck: z
    .object({
      interval: z.number().optional().default(30000),
      timeout: z.number().optional().default(5000),
      unhealthyThreshold: z.number().optional().default(3),
    })
    .optional(),
});

export const AuthConfigSchema = z.object({
  token: z.string().optional(),
  tokens: z.array(z.string()).optional(),
});

export const ConfigSchema = z.object({
  servers: z.record(ServerConfigSchema),
  auth: AuthConfigSchema.optional(),
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
