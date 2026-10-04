import { describe, expect, it } from 'vitest';
import { DEFAULT_DIMS } from '../src/core/constants';
import { defaultParams, type GenParams } from '../src/core/params';
import { DEPTH } from '../src/gen/layout';
import { makePlan, pickPeaks, scoreCurve, type Placement } from '../src/gen/plan';
import { SCROLL_H, units } from '../src/gen/units';

const u = units(DEFAULT_DIMS, 2);
const p = (over: Record<string, number> = {}): GenParams => ({ ...defaultParams(), ...over });
const mountains = (pl: Placement[]) => pl.filter((q) => q.depth !== 'far' && q.kind === 'peak');

describe('makePlan', () => {
  it('is deterministic', () => {
    expect(makePlan(7, p(), u)).toEqual(makePlan(7, p(), u));
    expect(makePlan(7, p(), u)).not.toEqual(makePlan(8, p(), u));
  });

  it('mountainHeight 0 gives no placements', () => {
    expect(makePlan(1, p({ mountainHeight: 0 }), u)).toEqual([]);
  });

  it('keeps everything on the scroll, with finite sizes', () => {
    for (let s = 1; s <= 5; s++) {
      for (const q of makePlan(s, p({ spacing: 0 }), u)) {
        expect(q.x).toBeGreaterThanOrEqual(0);
        expect(q.x).toBeLessThanOrEqual(u.widthUnits);
        expect(q.y).toBeGreaterThan(0);
        expect(q.y).toBeLessThanOrEqual(SCROLL_H);
        expect(Number.isFinite(q.height) && Number.isFinite(q.halfWidth)).toBe(true);
      }
    }
  });

  it('more spacing gives fewer mountains', () => {
    let tight = 0;
    let loose = 0;
    for (let s = 1; s <= 6; s++) {
      tight += mountains(makePlan(s, p({ spacing: 0.1 }), u)).length;
      loose += mountains(makePlan(s, p({ spacing: 0.9 }), u)).length;
    }
    expect(tight).toBeGreaterThan(loose);
  });

  it('stacks mountains at different depths: feet spread over the page, and the far ones are higher up', () => {
    const pl = makePlan(3, p(), u);
    const ms = mountains(pl);
    expect(ms.length).toBeGreaterThan(2);
    const ys = ms.map((q) => q.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(80);
    for (const q of pl.filter((q) => q.depth === 'far')) expect(q.y).toBeLessThan(DEPTH.mountTop * SCROLL_H);
  });

  it('has plateaus (the foreground land) for most seeds', () => {
    let withFlats = 0;
    for (let s = 1; s <= 6; s++) if (makePlan(s, p(), u).some((q) => q.kind === 'flat')) withFlats++;
    expect(withFlats).toBeGreaterThanOrEqual(4);
  });
});

describe('far row', () => {
  it('covers most of the scroll for every seed', () => {
    for (let s = 1; s <= 5; s++) {
      const far = makePlan(s, p(), u).filter((q) => q.depth === 'far');
      expect(far.every((q) => q.kind === 'far')).toBe(true);
      const covered = new Uint8Array(Math.ceil(u.widthUnits));
      for (const q of far) for (let x = Math.max(0, Math.floor(q.x - q.halfWidth)); x < Math.min(covered.length, q.x + q.halfWidth); x++) covered[x] = 1;
      expect(covered.reduce((a, b) => a + b, 0) / covered.length).toBeGreaterThanOrEqual(0.8);
    }
  });
});

describe('mountain graph', () => {
  it('scoreCurve and pickPeaks reproduce the planner near-row picks', () => {
    const curve = scoreCurve(7, 0.5, u.widthUnits);
    expect(pickPeaks(curve)).toEqual(
      pickPeaks(scoreCurve(7, 0.5, u.widthUnits)),
    );
    expect(curve.xs.length).toBeGreaterThan(100);
    expect(Math.min(...curve.score)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...curve.score)).toBeLessThanOrEqual(1);
  });

  it('a height edit scales one mountain and moves nothing else', () => {
    const base = makePlan(7, p(), u);
    const i = base.findIndex((q) => q.kind === 'peak');
    const edited = makePlan(7, p(), u, undefined, { [i]: 2 });
    expect(edited).toEqual(makePlan(7, p(), u, undefined, { [i]: 2 }));
    expect(edited[i].height).toBeCloseTo(base[i].height * 2);
    edited.forEach((q, j) => {
      expect(q.x).toBe(base[j].x);
      if (j !== i) expect(q.height).toBe(base[j].height);
    });
  });
});
