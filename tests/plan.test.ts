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
