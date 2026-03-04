import { EventEmitter } from "events";

type EventHandler = (...args: any[]) => void;

/**
 * Simple EventBus for decoupled inter-component communication.
 *
 * Wraps Node.js EventEmitter with a minimal API.
 *
 * Usage:
 *   const bus = new EventBus();
 *   bus.subscribe('server.started', (id) => {...});
 *   bus.emit('server.started', serverId);
 */
export class EventBus extends EventEmitter {
  /** Subscribe to an event */
  subscribe(event: string | symbol, handler: EventHandler): this {
    return this.on(event, handler);
  }

  /** Unsubscribe from an event */
  unsubscribe(event: string | symbol, handler: EventHandler): this {
    return this.off(event, handler);
  }

  /** One-time subscription */
  subscribeOnce(event: string | symbol, handler: EventHandler): this {
    return this.once(event, handler);
  }

  /** Clear all subscribers */
  clear(): this {
    this.removeAllListeners();
    return this;
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
