import { describe, expect, it } from 'vitest';
import type { Cloud } from '../src/core/clouds';
import { lobesOf } from '../src/core/layers/clouds';

const cloud = (hw: number, hh: number, seed: number): Cloud => ({ obj: 0, x: 100, y: 50, hw, hh, water: 0, puff: false, seed });

describe('cloud drawing', () => {
  it('joins its lobes into one mass whatever the cloud\'s shape (no row of separate circles)', () => {
    for (const [hw, hh] of [[6, 4], [14, 4], [30, 4], [60, 5], [90, 4], [20, 12]]) {
      for (let seed = 1; seed <= 6; seed++) {
        const lobes = lobesOf(cloud(hw, hh, seed), 100);
        const top = lobes.filter((l) => l.ry > hh * 0.8).sort((a, b) => a.x - b.x); // the big billows
        for (let i = 1; i < top.length; i++) expect(top[i].x - top[i - 1].x).toBeLessThan(top[i].rx + top[i - 1].rx);
        const base = lobes.filter((l) => l.ry <= hh * 0.8).sort((a, b) => a.x - b.x);
        for (let i = 1; i < base.length; i++) expect(base[i].x - base[i - 1].x).toBeLessThan(base[i].rx + base[i - 1].rx);
      }
    }
  });
});
