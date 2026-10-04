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
