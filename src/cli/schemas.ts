import { z } from "zod";

export const CliArgsSchema = z.object({
  configPath: z.string().default("./config.yaml"),
  verbose: z.boolean().default(false),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
  help: z.boolean().default(false),
  version: z.boolean().default(false),
});

export type CliArgs = z.infer<typeof CliArgsSchema>;

export function parseCliArgs(args: string[]): CliArgs {
  const parsed: Record<string, string | boolean> = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    
    if (arg === "--version" || arg === "-v") {
      parsed.version = true;
      continue;
    }
    
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      
      if (nextArg !== undefined && !nextArg.startsWith("--")) {
        if (nextArg === "true") {
          parsed[key] = true;
        } else if (nextArg === "false") {
          parsed[key] = false;
        } else if (/^\d+$/.test(nextArg)) {
          parsed[key] = nextArg;
        } else {
          parsed[key] = nextArg;
        }
        i++;
      } else {
        parsed[key] = true;
      }
    } else if (!arg.startsWith("-")) {
      if (!parsed.configPath) {
        parsed.configPath = arg;
      }
    }
  }
  
  return CliArgsSchema.parse(parsed);
}

export function showHelp(): void {
  console.log(`
oh-my-mcp - MCP Gateway Server

Usage: oh-my-mcp [options] [config-path]

Options:
  --config-path <path>   Path to config file (default: ./config.yaml)
  --port <number>        Override management port
  --log-level <level>   Set log level: debug, info, warn, error
  --verbose, -v         Enable verbose logging
  --help, -h            Show this help message
  --version, -V         Show version number

Examples:
  oh-my-mcp                     # Use default config.yaml
  oh-my-mcp ./prod.yaml         # Use custom config
  oh-my-mcp --log-level debug   # Debug logging
  `);
}

export function showVersion(): void {
  console.log("oh-my-mcp v1.0.2-pre");
}
