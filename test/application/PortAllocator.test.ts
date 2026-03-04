import { describe, it, expect, beforeEach } from 'vitest';
import { PortAllocator } from '../../src/application/PortAllocator.js';

describe('PortAllocator', () => {
  let pa: PortAllocator;

  beforeEach(() => {
    pa = new PortAllocator(8000);
  });

  it('should allocate sequential ports', () => {
    const p1 = pa.allocate();
    const p2 = pa.allocate();
    const p3 = pa.allocate();

    expect(p1).toBe(8000);
    expect(p2).toBe(8001);
    expect(p3).toBe(8002);
  });

  it('should reuse released ports before allocating new ones', () => {
    pa.allocate(); // 8000
    pa.allocate(); // 8001
    pa.release(8000);
    pa.release(8001);

    const p1 = pa.allocate();
    const p2 = pa.allocate();

    expect(p1).toBe(8001); // LIFO, so 8001 first
    expect(p2).toBe(8000);
  });

  it('should reserve manual ports and not allocate them', () => {
    pa.reserve(9000);
    const allocated = pa.allocate();

    expect(pa.isAllocated(9000)).toBe(true);
    expect(allocated).toBe(8000); // manual port is separate; sequential start from 8000
  });

  it('should throw when reserving an already reserved manual port', () => {
    pa.reserve(9001);
    expect(() => pa.reserve(9001)).toThrow('Port 9001 is already reserved');
  });

  it('should release auto-allocated ports and allow reallocation', () => {
    const p = pa.allocate();
    expect(pa.isAllocated(p)).toBe(true);

    pa.release(p);
    expect(pa.isAllocated(p)).toBe(false);

    const p2 = pa.allocate();
    expect(p2).toBe(p);
  });

  it('should allocate sequential ports correctly after many allocations', () => {
    // Allocate 100 ports
    for (let i = 0; i < 100; i++) {
      pa.allocate();
    }
    // The 101st allocation should be basePort + 100 = 8100
    const last = pa.allocate();
    expect(last).toBe(8000 + 100); // 8100
  });
});
