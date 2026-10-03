import { describe, expect, it } from 'vitest';
import { Clock } from '../src/core/clock';

describe('Clock', () => {
  const counting = () => {
    const c = { ticks: 0, clock: null as unknown as Clock };
    c.clock = new Clock(() => c.ticks++);
    return c;
  };

  it('steps exactly N ticks for N accumulator units in one call', () => {
    for (const n of [1, 7, 10, 32]) {
      const c = counting();
      expect(c.clock.advance(n * Clock.STEP_MS)).toBe(n);
      expect(c.ticks).toBe(n);
    }
  });

  it('steps exactly N ticks for N single-unit calls and accumulates fractions', () => {
    const c = counting();
    for (let i = 0; i < 1000; i++) c.clock.advance(Clock.STEP_MS);
    expect(c.ticks).toBe(1000);
    const d = counting();
    for (let i = 0; i < 300; i++) d.clock.advance(Clock.STEP_MS / 3);
    expect(d.ticks).toBe(100);
  });

  it('respects pause, single-step and speed', () => {
    const c = counting();
    c.clock.paused = true;
    expect(c.clock.advance(10 * Clock.STEP_MS)).toBe(0);
    c.clock.stepOnce();
    expect(c.ticks).toBe(1);
    c.clock.paused = false;
    c.clock.speed = 2;
    c.clock.advance(5 * Clock.STEP_MS);
    expect(c.ticks).toBe(11);
    c.clock.speed = 0.25;
    c.clock.advance(4 * Clock.STEP_MS);
    expect(c.ticks).toBe(12);
  });

  it('caps ticks per call so a stalled tab does not spiral', () => {
    const c = counting();
    expect(c.clock.advance(10_000)).toBe(c.clock.maxTicksPerAdvance);
    expect(c.clock.advance(0)).toBeLessThanOrEqual(1);
  });
});
