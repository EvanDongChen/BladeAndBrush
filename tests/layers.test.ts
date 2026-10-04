import { describe, expect, it } from 'vitest';
import { Flag, NO_PLANE } from '../src/core/constants';
import { El } from '../src/core/elements';
import { World } from '../src/core/world';
import { step } from '../src/sim/step';
import './helpers';

/** One column of 3 stacked materials at x = 1: front ROCK(plane 1), then TREE(plane 3), then ROCK(plane 5). */
function stacked(): World {
  const w = new World({ w: 3, h: 2 }, 1);
  const i = w.idx(1, 0);
  w.el[i] = El.ROCK;
  w.plane[i] = 1;
  w.owner[i] = 10;
  w.behindEl[0][i] = El.TREE;
  w.behindOwner[0][i] = 11;
  w.behindPlane[0][i] = 3;
  w.behindEl[1][i] = El.ROCK;
  w.behindOwner[1][i] = 12;
  w.behindPlane[1][i] = 5;
  w.flags[i] |= Flag.HAS_BEHIND;
  return w;
}

describe('layered pixels', () => {
  it('destroying the front cell brings the next layer forward, one layer per break', () => {
    const w = stacked();
    const i = w.idx(1, 0);
    w.set(1, 0, El.EMPTY, { cut: true });
    expect(w.el[i]).toBe(El.EMPTY); // not promoted until the step ends
    step(w);
    expect([w.el[i], w.owner[i], w.plane[i]]).toEqual([El.TREE, 11, 3]);
    expect(w.flags[i] & Flag.HAS_BEHIND).toBe(Flag.HAS_BEHIND);
    w.set(1, 0, El.EMPTY);
    step(w);
    expect([w.el[i], w.owner[i], w.plane[i]]).toEqual([El.ROCK, 12, 5]);
    expect(w.flags[i] & Flag.HAS_BEHIND).toBe(0); // last layer
    w.set(1, 0, El.EMPTY);
    step(w);
    expect([w.el[i], w.plane[i]]).toEqual([El.EMPTY, NO_PLANE]); // nothing left behind
  });

  it('drops burnt residue instead of leaving ash on top of the exposed layer', () => {
    const w = stacked();
    const i = w.idx(1, 0);
    w.set(1, 0, El.ASH);
    step(w);
    expect(w.el[i]).toBe(El.TREE);
  });

  it('a burning front cell stays until it has burnt out', () => {
    const w = stacked();
    const i = w.idx(1, 0);
    w.set(1, 0, El.FIRE, { aux: El.ROCK, life: 50 });
    step(w);
    expect(w.el[i]).toBe(El.FIRE);
    w.set(1, 0, El.EMPTY);
    step(w);
    expect(w.el[i]).toBe(El.TREE);
  });

  it('is deterministic: the same breaks give the same world hash', () => {
    const run = () => {
      const w = stacked();
      w.set(1, 0, El.EMPTY);
      step(w);
      w.set(1, 0, El.EMPTY);
      step(w);
      return w.hash();
    };
    expect(run()).toBe(run());
  });
});

import { flags } from '../src/core/config';
import { FAR_PLANE } from '../src/core/constants';
import { defaultParams } from '../src/core/params';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';

describe('farLayerInteractive', () => {
  const reveal = () => {
    const bp = generate(2, defaultParams(), { k: 1 });
    const w = new World(bp, 2);
    new Frontier(bp).revealAll(w);
    return { bp, w };
  };

  it('is off by default: the far ridges stay background art', () => {
    expect(flags.farLayerInteractive).toBe(false);
    const { w } = reveal();
    expect(w.plane.some((p) => p === FAR_PLANE)).toBe(false);
    expect(w.behindPlane.some((a) => a.some((p) => p === FAR_PLANE))).toBe(false);
  });

  it('when on, far ridges become real rock at the back of the stack', () => {
    flags.farLayerInteractive = true;
    try {
      const { bp, w } = reveal();
      let front = 0;
      for (let i = 0; i < w.size; i++) if (w.plane[i] === FAR_PLANE) (front++, expect(w.el[i]).toBe(El.ROCK));
      expect(front).toBeGreaterThan(0);
      const rock = (el: Uint8Array) => el.reduce((n, v) => n + (v === El.ROCK ? 1 : 0), 0);
      expect(rock(w.el)).toBeGreaterThan(rock(bp.el));
      // breaking the near mountain in front of a far ridge brings that ridge forward
      let i = 0;
      while (i < w.size && !(w.plane[i] === 1 && w.behindPlane.some((a) => a[i] === FAR_PLANE))) i++;
      if (i < w.size) {
        w.set(i % w.w, (i / w.w) | 0, El.EMPTY);
        w.applyPending();
        expect(w.el[i]).not.toBe(El.EMPTY);
      }
    } finally {
      flags.farLayerInteractive = false;
    }
  });
});
