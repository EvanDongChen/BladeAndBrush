import { describe, expect, it } from 'vitest';
import type { Cloud } from '../src/core/clouds';
import { baseOf, lobesOf } from '../src/core/layers/clouds';

const cloud = (hw: number, hh: number, seed: number): Cloud => ({ obj: 0, x: 100, y: 50, hw, hh, water: 0, puff: false, seed });

const SHAPES = [[6, 4], [14, 4], [30, 4], [60, 5], [90, 4], [20, 12]];

describe('cloud drawing', () => {
  it('joins its lobes into one mass whatever the cloud\'s shape (no row of separate circles)', () => {
    for (const [hw, hh] of SHAPES) {
      for (let seed = 1; seed <= 6; seed++) {
        const lobes = lobesOf(cloud(hw, hh, seed), 100).sort((a, b) => a.x - b.x);
        for (let i = 1; i < lobes.length; i++) expect(lobes[i].x - lobes[i - 1].x).toBeLessThan(lobes[i].rx + lobes[i - 1].rx);
      }
    }
  });

  it('has one row of big billows: every lobe is a real billow, not a small disc under the others', () => {
    // A second, short row along the base is what read as a bunch of circles hanging off the bottom.
    for (const [hw, hh] of SHAPES) {
      for (let seed = 1; seed <= 6; seed++) {
        const lobes = lobesOf(cloud(hw, hh, seed), 100);
        const shortest = Math.min(...lobes.map((l) => l.ry));
        expect(shortest).toBeGreaterThan(hh * 0.6);
      }
    }
  });

  it('ends on a flat base line that cuts through every lobe, so the bottom is one unbroken edge', () => {
    for (const [hw, hh] of SHAPES) {
      for (let seed = 1; seed <= 6; seed++) {
        const c = cloud(hw, hh, seed);
        const lobes = lobesOf(c, c.x);
        const base = baseOf(c, c.x, lobes);
        for (const l of lobes) {
          expect(Math.abs(base.y - l.y)).toBeLessThan(l.ry); // the line crosses this lobe
        }
        expect(base.x1).toBeGreaterThan(base.x0);
        expect(base.top).toBeLessThan(base.y);
      }
    }
  });
});