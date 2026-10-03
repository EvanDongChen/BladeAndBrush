import { describe, expect, it } from 'vitest';
import { DEFAULT_DIMS } from '../src/core/constants';
import { defaultParams, type GenParams } from '../src/core/params';
import { makePlan, minGap, type Placement } from '../src/gen/plan';
import { units } from '../src/gen/units';

const u = units(DEFAULT_DIMS, 2);
const p = (over: Record<string, number> = {}): GenParams => ({ ...defaultParams(), ...over });
const peaks = (pl: Placement[], depth: string) => pl.filter((q) => q.kind === 'peak' && q.depth === depth);

describe('makePlan', () => {
  it('is deterministic', () => {
    expect(makePlan(7, p(), u)).toEqual(makePlan(7, p(), u));
    expect(makePlan(7, p(), u)).not.toEqual(makePlan(8, p(), u));
  });

  it('keeps same-row peaks at least the row gap apart', () => {
    for (const spacing of [0, 0.5, 1]) {
      const pl = makePlan(3, p({ spacing }), u);
      for (const [depth, gap] of [
        ['near', minGap(spacing)],
        ['mid', 0.7 * minGap(spacing)],
      ] as const) {
        const xs = peaks(pl, depth)
          .map((q) => q.x)
          .sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(gap);
      }
    }
  });

  it('more spacing gives fewer near peaks', () => {
    let tight = 0;
    let loose = 0;
    for (let s = 1; s <= 5; s++) {
      tight += peaks(makePlan(s, p({ spacing: 0.1 }), u), 'near').length;
      loose += peaks(makePlan(s, p({ spacing: 0.9 }), u), 'near').length;
    }
    expect(tight).toBeGreaterThan(loose);
  });

  it('always has a near peak, even at max spacing', () => {
    for (let s = 1; s <= 10; s++) expect(peaks(makePlan(s, p({ spacing: 1 }), u), 'near').length).toBeGreaterThanOrEqual(1);
  });

  it('mountainHeight 0 gives no placements', () => {
    expect(makePlan(1, p({ mountainHeight: 0 }), u)).toEqual([]);
  });

  it('stays inside the scroll', () => {
    for (const q of makePlan(2, p({ spacing: 0 }), u)) {
      expect(q.x).toBeGreaterThanOrEqual(0);
      expect(q.x).toBeLessThanOrEqual(u.widthUnits);
      expect(Number.isFinite(q.height) && Number.isFinite(q.halfWidth)).toBe(true);
    }
  });
});

describe('far row', () => {
  it('covers almost the whole scroll for every seed', () => {
    for (let s = 1; s <= 5; s++) {
      const far = makePlan(s, p(), u).filter((q) => q.depth === 'far');
      expect(far.every((q) => q.kind === 'far')).toBe(true);
      const covered = new Uint8Array(Math.ceil(u.widthUnits));
      for (const q of far) for (let x = Math.max(0, Math.floor(q.x - q.halfWidth)); x < Math.min(covered.length, q.x + q.halfWidth); x++) covered[x] = 1;
      expect(covered.reduce((a, b) => a + b, 0) / covered.length).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('is lower than the near peaks on average', () => {
    const pl = makePlan(3, p(), u);
    const avg = (d: string) => {
      const q = pl.filter((x) => x.depth === d);
      return q.reduce((s, x) => s + x.height, 0) / q.length;
    };
    expect(avg('far')).toBeLessThan(avg('near'));
  });
});

describe('mountains leave room (Emmy notes)', () => {
  const rows = ['near', 'mid'] as const;
  it('mountains in the same row never touch', () => {
    for (let s = 1; s <= 5; s++) {
      for (const spacing of [0, 0.5, 1]) {
        const pl = makePlan(s, p({ spacing }), u);
        for (const d of rows) {
          const r = pl.filter((q) => q.depth === d).sort((a, b) => a.x - b.x);
          for (let i = 1; i < r.length; i++) expect(r[i].x - r[i].halfWidth).toBeGreaterThan(r[i - 1].x + r[i - 1].halfWidth);
        }
      }
    }
  });

  it('mountains cover well under the whole ground: open land stays visible', () => {
    for (let s = 1; s <= 5; s++) {
      const pl = makePlan(s, p({ spacing: 0 }), u).filter((q) => q.depth !== 'far');
      const covered = new Uint8Array(Math.ceil(u.widthUnits));
      for (const q of pl) for (let x = Math.max(0, Math.floor(q.x - q.halfWidth)); x < Math.min(covered.length, q.x + q.halfWidth); x++) covered[x] = 1;
      expect(covered.reduce((a, b) => a + b, 0) / covered.length).toBeLessThanOrEqual(0.7);
    }
  });
});
