import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { evaluateGoal } from '../src/core/goals';
import { World } from '../src/core/world';
import { findPeaks, heightAt, scan } from '../src/gen/scan';
import './helpers';

/** Ground row + a triangle of rock `height` tall centered at cx. */
function triangleWorld(height: number, cx = 100): World {
  const w = new World({ w: 200, h: 100 }, 1);
  for (let x = 0; x < w.w; x++) w.set(x, w.h - 1, El.ROCK);
  for (let x = 0; x < w.w; x++) {
    const colH = height - Math.abs(x - cx);
    for (let k = 1; k <= colH; k++) w.set(x, w.h - 1 - k, El.ROCK);
  }
  return w;
}

describe('scan', () => {
  it('heightAt reads the topmost solid cell; stain and water are not solid', () => {
    const w = new World({ w: 4, h: 10 }, 1);
    expect(heightAt(w, 0)).toBe(0);
    w.set(0, 9, El.ROCK);
    w.set(0, 2, El.STAIN);
    w.set(0, 3, El.WATER);
    expect(heightAt(w, 0)).toBe(1);
    w.set(0, 4, El.TREE);
    expect(heightAt(w, 0)).toBe(6);
  });

  it('one 40-high triangle gives one tall peak', () => {
    const r = scan(triangleWorld(40));
    expect(r.peaks).toEqual([{ x: 100, h: 41, prominence: 40 }]);
    expect(r.counts.tallMountains).toBe(1);
    expect(r.counts.shortMountains).toBe(0);
  });

  it('a 20-high triangle is short; flat ground is no peak', () => {
    expect(scan(triangleWorld(20)).counts).toMatchObject({ tallMountains: 0, shortMountains: 1 });
    expect(scan(triangleWorld(0)).peaks).toEqual([]);
  });

  it('prominence uses the col to higher ground', () => {
    const heights = Int16Array.from([0, 5, 10, 5, 8, 5, 20, 0]);
    expect(findPeaks(heights)).toEqual([
      { x: 2, h: 10, prominence: 5 },
      { x: 4, h: 8, prominence: 3 },
      { x: 6, h: 20, prominence: 20 },
    ]);
    expect(findPeaks(heights, 4).map((p) => p.x)).toEqual([2, 6]);
  });

  it('counts trees as connected components and waterfalls as vertical runs', () => {
    const w = new World({ w: 50, h: 30 }, 1);
    for (let y = 20; y < 25; y++) w.set(5, y, El.TREE);
    for (let y = 20; y < 25; y++) w.set(10, y, El.TREE);
    w.set(11, 20, El.TREE); // touches tree 2: still one tree
    for (let y = 0; y < 12; y++) {
      w.set(30, y, El.WATER);
      w.set(31, y, El.WATER); // side by side: one waterfall
    }
    for (let y = 0; y < 4; y++) w.set(40, y, El.WATER); // too short
    const r = scan(w);
    expect(r.counts.trees).toBe(2);
    expect(r.counts.waterfalls).toBe(1);
    expect(r.counts.water).toBe(28);
  });

  it('metric goals evaluate against scan counts', () => {
    const r = scan(triangleWorld(40));
    expect(evaluateGoal(r, { type: 'metric', metric: 'tallMountains', op: '>=', n: 1 })).toEqual({ pass: true, progress: 1 });
    expect(evaluateGoal(r, { type: 'metric', metric: 'trees', op: '>=', n: 4 })).toEqual({ pass: false, progress: 0 });
    expect(() => evaluateGoal(r, { type: 'nope' })).toThrow(/Unknown goal type/);
  });
});
