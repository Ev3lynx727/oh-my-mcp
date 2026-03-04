/**
 * PortAllocator manages port allocation for MCP servers.
 *
 * Guarantees:
 * - Each port is allocated at most once (unless released and reused)
 * - Manual (user-specified) ports are tracked and not auto-allocated
 * - Released ports are reused before allocating new ones (conserves port range)
 */
export class PortAllocator {
  private basePort: number;
  private usedPorts: Set<number> = new Set();
  private releasedPorts: number[] = []; // LIFO stack for reuse
  private portCounter: number = 0;

  /**
   * Create a new PortAllocator.
   *
   * @param basePort - Starting port for auto-allocation (default 8100)
   */
  constructor(basePort: number = 8100) {
    this.basePort = basePort;
  }

  /**
   * Allocate the next available port.
   *
   * Preference:
   * 1. Reuse a released port (if any)
   * 2. Allocate a new sequential port from basePort + counter
   *
   * @returns A port number that is now allocated
   */
  allocate(): number {
    if (this.releasedPorts.length > 0) {
      const port = this.releasedPorts.pop()!;
      this.usedPorts.add(port);
      return port;
    }

    const port = this.basePort + this.portCounter++;
    // Guard against overflow (unlikely but safe)
    if (port > 65535) {
      throw new Error("Exhausted port range (basePort + counter > 65535)");
    }
    this.usedPorts.add(port);
    return port;
  }

  /**
   * Release a port back to the allocator for reuse.
   *
   * Safe to call multiple times on the same port; no-op if port wasn't allocated.
   *
   * @param port - The port to release
   */
  release(port: number): void {
    if (!this.usedPorts.has(port)) {
      // Already released or never allocated; ignore
      return;
    }
    this.usedPorts.delete(port);
    this.releasedPorts.push(port);
  }

  /**
   * Reserve a manually-specified port.
   *
   * This marks the port as "used" so allocate() won't reuse it,
   * but it doesn't come from the allocator's counter.
   *
   * Throws if the port is already reserved/allocated.
   *
   * @param port - The manual port to reserve
   */
  reserve(port: number): void {
    if (this.usedPorts.has(port)) {
      throw new Error(`Port ${port} is already reserved`);
    }
    this.usedPorts.add(port);
  }

  /**
   * Check if a port is currently allocated.
   */
  isAllocated(port: number): boolean {
    return this.usedPorts.has(port);
  }

  /**
   * Get all currently allocated ports (snapshot).
   */
  getAllocated(): number[] {
    return Array.from(this.usedPorts);
  }

  /**
   * Get the count of currently allocated ports.
   */
  get count(): number {
    return this.usedPorts.size;
  }

  /**
   * Reset the allocator (clear all state).
   *
   * Useful for testing or complete system reset.
   */
  reset(): void {
    this.usedPorts.clear();
    this.releasedPorts = [];
    this.portCounter = 0;
  }
}
