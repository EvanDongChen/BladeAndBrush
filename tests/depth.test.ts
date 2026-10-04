import { describe, expect, it } from 'vitest';
import './helpers';
import { ELEMENTS } from '../src/core/elements';

describe('FAR_ROCK', () => {
  it('is registered at id 32 and never counts for the scanner', () => {
    expect(ELEMENTS[32]?.name).toBe('far_rock');
    expect(ELEMENTS[32]?.solidForScan).toBe(false);
  });
});

import { defaultParams } from '../src/core/params';
import { generate } from '../src/gen/generate';

describe('background plane', () => {
  const gen = (features: Record<string, boolean> = {}) => generate(2, defaultParams(), { k: 2, features });

  it('holds the far ridges; the physics plane never does', () => {
    const bp = gen();
    expect(bp.bg!.some((v) => v === 32)).toBe(true);
    expect(bp.el.some((v) => v === 32)).toBe(false);
  });

  it('turning far ridges off leaves the foreground identical and no far cells', () => {
    const on = gen();
    const off = gen({ farRidges: false });
    expect(Buffer.from(off.el).equals(Buffer.from(on.el))).toBe(true);
    expect(off.bg!.every((v) => v === 0)).toBe(true);
  });

  it('far ridge art is translucent everywhere, so the paper shows through it (the water lines are separate)', () => {
    const bp = gen({ mountains: false });
    let max = 0;
    let painted = 0;
    for (const c of bp.art!.bg) {
      max = Math.max(max, c >>> 24);
      if (c >>> 24) painted++;
    }
    expect(painted).toBeGreaterThan(0);
    expect(max).toBeLessThan(200);
  });
});

describe('plateau scenes', () => {
  it('boulders and trees on a plateau are grouped under it, and nothing grows on a boulder', () => {
    const bp = generate(4, defaultParams(), { k: 2 });
    const strokes = [...bp.registry.strokes.values()];
    const grouped = strokes.filter((q) => (q.kind === 'rock' || q.kind === 'tree') && q.group !== undefined);
    expect(grouped.length).toBeGreaterThan(0);
    for (const q of grouped) expect(bp.registry.strokes.get(q.group!)?.kind).toBe('mountain');
    // objects planes (0 and 2): a cell is either a tree or a boulder, never both, by construction;
    // check no tree's anchor sits inside a boulder cell
    for (const q of strokes.filter((s) => s.kind === 'tree')) {
      const [ax, ay] = q.anchor;
      for (const pl of [0, 2]) expect(bp.planes![pl].el[ay * bp.w + ax] === 1).toBe(false);
    }
  });
});
