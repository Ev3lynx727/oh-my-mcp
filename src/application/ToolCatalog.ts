import { BackendClient } from "../domain/BackendClient.js";
import { getLogger } from "../logger.js";

const logger = getLogger();

export interface ToolRoute {
  serverId: string;
  toolName: string;
  definition: any;
  backendClient: BackendClient;
}

/**
 * ToolCatalog aggregates tools from all running backends.
 *
 * Tools are namespaced with `serverId__toolName` to prevent collisions.
 * The catalog is cached for 60s and refreshed on demand.
 * Backends that are down are omitted (degraded mode).
 */
export class ToolCatalog {
  private tools: Map<string, ToolRoute> = new Map();
  private cachedAt: number = 0;
  private ttlMs: number;
  private degraded: boolean = false;
  private fetching: Promise<void> | null = null;

  constructor(ttlMs: number = 60000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Get a tool route by namespaced name.
   * Returns undefined if not found or catalog is stale.
   */
  getTool(name: string): ToolRoute | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools as an array of MCP tool definitions.
   * Forces refresh if catalog is stale.
   */
  async getAllTools(backends: Map<string, BackendClient>): Promise<any[]> {
    await this.ensureFresh(backends);
    return Array.from(this.tools.values()).map((route) => route.definition);
  }

  /**
   * Check if the catalog is in degraded mode (some backends failed).
   */
  isDegraded(): boolean {
    return this.degraded;
  }

  /**
   * Force invalidate the catalog cache.
   */
  invalidate(): void {
    this.cachedAt = 0;
    this.tools.clear();
    this.degraded = false;
  }

  private isStale(): boolean {
    return Date.now() - this.cachedAt > this.ttlMs;
  }

  private async ensureFresh(backends: Map<string, BackendClient>): Promise<void> {
    if (!this.isStale()) return;

    // Deduplicate concurrent refreshes
    if (this.fetching) {
      await this.fetching;
      return;
    }

    this.fetching = this.refresh(backends);
    try {
      await this.fetching;
    } finally {
      this.fetching = null;
    }
  }

  private async refresh(backends: Map<string, BackendClient>): Promise<void> {
    const newTools = new Map<string, ToolRoute>();
    let failed = 0;

    const requests = Array.from(backends.entries()).map(async ([serverId, client]) => {
      if (!client.isHealthy()) {
        failed++;
        return;
      }
      try {
        const response = await client.sendRequest({
          jsonrpc: "2.0",
          id: `catalog-${serverId}`,
          method: "tools/list",
          params: {},
        });
        const tools = response?.result?.tools ?? [];
        for (const tool of tools) {
          const namespacedName = `${serverId}__${tool.name}`;
          newTools.set(namespacedName, {
            serverId,
            toolName: tool.name,
            definition: {
              name: namespacedName,
              description: tool.description,
              inputSchema: tool.inputSchema,
            },
            backendClient: client,
          });
        }
      } catch (err: any) {
        logger.warn({ server: serverId, error: err.message }, "Failed to fetch tools from backend");
        failed++;
      }
    });

    await Promise.allSettled(requests);

    this.tools = newTools;
    this.cachedAt = Date.now();
    this.degraded = failed > 0;

    logger.info(
      { tools: newTools.size, backends: backends.size, failed },
      "Tool catalog refreshed"
    );
  }
}
