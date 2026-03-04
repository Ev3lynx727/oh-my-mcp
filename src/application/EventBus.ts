import { EventEmitter } from "events";

type EventHandler = (...args: any[]) => void;

/**
 * Simple EventBus for decoupled inter-component communication.
 *
 * Wraps Node.js EventEmitter with a minimal API.
 *
 * Usage:
 *   const bus = new EventBus();
 *   bus.on('server.started', (id) => {...});
 *   bus.emit('server.started', serverId);
 */
export class EventBus extends EventEmitter {
  /** Subscribe to an event */
  on(event: string | symbol, listener: EventHandler): this {
    return super.on(event, listener);
  }

  /** One-time subscription */
  once(event: string | symbol, listener: EventHandler): this {
    return super.once(event, listener);
  }

  /** Unsubscribe */
  off(event: string | symbol, listener: EventHandler): this {
    return super.off(event, listener);
  }

  /** Remove all listeners for an event */
  removeAllListeners(event?: string | symbol): this {
    return super.removeAllListeners(event);
  }

  /** Emit an event */
  emit(event: string | symbol, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  /** Get listener count for an event */
  listenerCount(event: string | symbol): number {
    return super.listenerCount(event);
  }
}
