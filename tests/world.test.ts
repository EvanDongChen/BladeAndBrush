import { describe, expect, it } from 'vitest';
import { Flag } from '../src/core/constants';
import { El } from '../src/core/elements';
import { World } from '../src/core/world';
import { step } from '../src/sim/step';
import { blueprintWorld } from './helpers';

describe('World', () => {
  it('reads and writes cells, with out-of-bounds acting as solid wall', () => {
    const w = new World({ w: 10, h: 5 }, 1);
    expect(w.get(3, 2)).toBe(El.EMPTY);
    w.set(3, 2, El.WATER, { life: 9, owner: 4 });
    expect(w.get(3, 2)).toBe(El.WATER);
    expect(w.life[w.idx(3, 2)]).toBe(9);
    expect(w.owner[w.idx(3, 2)]).toBe(4);
    expect(w.get(-1, 0)).toBe(El.ROCK);
    expect(w.isEmpty(10, 0)).toBe(false);
    w.set(99, 99, El.ROCK); // ignored
  });

  it('swap moves contents but leaves CUT with the position', () => {
    const w = new World({ w: 4, h: 4 }, 1);
    w.set(0, 0, El.WATER, { owner: 7 });
    w.set(1, 0, El.EMPTY, { cut: true });
    w.swap(0, 0, 1, 0);
    expect(w.get(1, 0)).toBe(El.WATER);
    expect(w.owner[w.idx(1, 0)]).toBe(7);
    expect(w.flags[w.idx(1, 0)] & Flag.CUT).toBe(Flag.CUT);
    expect(w.flags[w.idx(0, 0)] & Flag.CUT).toBe(0);
  });

  it('a cut on a filled cell sets CUT and emits a cut event', () => {
    const w = new World({ w: 8, h: 8 }, 1);
    w.set(2, 2, El.ROCK, { owner: 3 });
    const seen: unknown[] = [];
    w.events.on('cut', (e) => seen.push(e));
    w.clearCircle(2, 2, 0, { cut: true });
    w.set(5, 5, El.EMPTY, { cut: true }); // already empty: flagged, but no event
    expect(seen).toEqual([{ x: 2, y: 2, el: El.ROCK, owner: 3 }]);
    expect(w.flags[w.idx(5, 5)] & Flag.CUT).toBe(Flag.CUT);
  });

  it('hash() is stable for a given seed and differs across seeds', () => {
    const a = blueprintWorld(7);
    const b = blueprintWorld(7);
    expect(a.hash()).toBe(b.hash());
    for (let i = 0; i < 30; i++) {
      step(a);
      step(b);
    }
    expect(a.tick).toBe(30);
    expect(a.hash()).toBe(b.hash());
    expect(blueprintWorld(8).hash()).not.toBe(blueprintWorld(7).hash());
  });

  it('hash() sees cell, tick and rng changes but ignores UPDATED bits', () => {
    const w = blueprintWorld(3);
    const h0 = w.hash();
    w.flags[0] |= Flag.UPDATED;
    expect(w.hash()).toBe(h0);
    w.aux[5] ^= 1;
    expect(w.hash()).not.toBe(h0);
    w.aux[5] ^= 1;
    w.rng.next();
    expect(w.hash()).not.toBe(h0);
  });
});
