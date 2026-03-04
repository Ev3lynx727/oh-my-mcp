import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../src/application/EventBus.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('should subscribe and emit simple events', () => {
    const handler = vi.fn();
    bus.subscribe('test', handler);
    bus.emit('test', 'arg1', 'arg2');
    expect(handler).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should allow multiple subscribers for same event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.subscribe('event', h1);
    bus.subscribe('event', h2);
    bus.emit('event');
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it('should unsubscribe', () => {
    const handler = vi.fn();
    bus.subscribe('evt', handler);
    bus.unsubscribe('evt', handler);
    bus.emit('evt');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not throw when unsubscribing non-existent', () => {
    const noop = () => {};
    expect(() => bus.unsubscribe('evt', noop)).not.toThrow();
  });

  it('should subscribe once (only first call)', () => {
    const handler = vi.fn();
    bus.subscribeOnce('once', handler);
    bus.emit('once');
    bus.emit('once');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should clear all subscribers', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.subscribe('a', h1);
    bus.subscribe('b', h2);
    bus.clear();
    bus.emit('a');
    bus.emit('b');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });
});
