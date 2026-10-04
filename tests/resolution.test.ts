import { describe, expect, it } from 'vitest';
import './helpers';
import { El } from '../src/core/elements';
import { defaultParams } from '../src/core/params';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';
import { planOf } from '../src/gen/plan';
import { scan } from '../src/gen/scan';

const gen = (seed: number, w: number, h: number, k: number) => generate(seed, defaultParams(), { dims: { w, h }, k });
const treeCount = (bp: ReturnType<typeof gen>) => [...bp.registry.strokes.values()].filter((s) => s.kind === 'tree').length;

describe('the resolution dial (grid size x art scale)', () => {
  it('plans the same scene whatever the grid resolution', () => {
    const lo = planOf(gen(2, 960, 256, 2));
    const hi = planOf(gen(2, 1920, 512, 1));
    expect(hi.map((p) => p.x.toFixed(3))).toEqual(lo.map((p) => p.x.toFixed(3)));
    expect(hi.map((p) => p.depth)).toEqual(lo.map((p) => p.depth));
  });

  it('gives the same number of mountains and a similar skyline at 2x the grid', () => {
    const lo = gen(3, 960, 256, 2);
    const hi = gen(3, 1920, 512, 1);
    const peaks = (bp: ReturnType<typeof gen>) => {
      const w = new World(bp, 3);
      new Frontier(bp).revealAll(w);
      return scan(w).peaks.length;
    };
    expect(Math.abs(peaks(hi) - peaks(lo))).toBeLessThanOrEqual(2);
    const mountains = (bp: ReturnType<typeof gen>) => [...bp.registry.strokes.values()].filter((s) => s.kind === 'mountain').length;
    expect(mountains(hi)).toBe(mountains(lo));
  });

  it('keeps trees and rock in proportion at the finer grid', () => {
    const lo = gen(4, 960, 256, 2);
    const hi = gen(4, 1920, 512, 1);
    expect(treeCount(hi)).toBeGreaterThan(treeCount(lo) * 0.6);
    expect(treeCount(hi)).toBeLessThan(treeCount(lo) * 1.6);
    const rock = (bp: ReturnType<typeof gen>) => bp.el.reduce((n, v) => n + (v === El.ROCK ? 1 : 0), 0);
    expect(rock(hi) / (hi.w * hi.h)).toBeGreaterThan((rock(lo) / (lo.w * lo.h)) * 0.8);
    expect(rock(hi) / (hi.w * hi.h)).toBeLessThan((rock(lo) / (lo.w * lo.h)) * 1.25);
  });
});
