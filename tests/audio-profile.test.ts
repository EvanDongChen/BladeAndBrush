import { describe, expect, it } from 'vitest';
import { chooseMode, degreeToMidi, inMode, MODES, type ModeName } from '../src/audio/theory';
import { findExtrema, readLandscape, STEPS } from '../src/audio/profile';
import { El } from '../src/core/elements';
import { World } from '../src/core/world';
import { blueprintWorld } from './helpers';

function flatWorld(): World {
  return new World({ w: 320, h: 100 }, 1);
}

/** Fill columns [x0, x1) with rock up to the given height. */
function mound(w: World, x0: number, x1: number, height: number): void {
  for (let x = x0; x < x1; x++) for (let y = w.h - height; y < w.h; y++) w.set(x, y, El.ROCK);
}

describe('theory', () => {
  it('maps degrees across octaves, including negative ones', () => {
    expect(degreeToMidi(50, 'gong', 0)).toBe(50);
    expect(degreeToMidi(50, 'gong', 5)).toBe(62);
    expect(degreeToMidi(50, 'gong', 7)).toBe(66);
    expect(degreeToMidi(50, 'gong', -1)).toBe(47);
  });

  it('every degree of every mode stays inside the mode', () => {
    for (const mode of Object.keys(MODES) as ModeName[]) {
      for (let d = -10; d < 20; d++) expect(inMode(52, mode, degreeToMidi(52, mode, d))).toBe(true);
    }
  });
});

describe('reading a landscape', () => {
  it('a flat world has no peaks, dips or ruggedness', () => {
    const land = readLandscape(flatWorld());
    expect(land.heights).toHaveLength(STEPS);
    expect(land.peaks).toEqual([]);
    expect(land.dips).toEqual([]);
    expect(land.rugged).toBe(0);
    expect(land.mean).toBe(0);
  });

  it('finds the peak of a mound and the dip between two mounds', () => {
    const w = flatWorld();
    mound(w, 0, 80, 30); // slices 0..7
    mound(w, 80, 120, 70); // slices 8..11, the tall one
    mound(w, 120, 160, 10); // slices 12..15, low
    mound(w, 160, 320, 40);
    const land = readLandscape(w);
    expect(land.peaks).toContain(8);
    expect(land.dips).toContain(12);
    expect(land.heights[9]).toBeCloseTo(0.7, 1);
  });

  it('sees water and fire', () => {
    const w = flatWorld();
    for (let x = 0; x < 200; x++) w.set(x, 90, El.WATER);
    for (let x = 0; x < 20; x++) w.set(x, 50, El.FIRE);
    const land = readLandscape(w);
    expect(land.water).toBeGreaterThan(0.5);
    expect(land.fire).toBeGreaterThan(0.5);
  });

  it('is deterministic and reads the generated painting', () => {
    const a = readLandscape(blueprintWorld(1));
    const b = readLandscape(blueprintWorld(1));
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
    expect(a.peaks.length).toBeGreaterThan(0);
  });

  it('extrema ignore small wobbles', () => {
    const { peaks, dips } = findExtrema(Float32Array.from([0.3, 0.31, 0.3, 0.31, 0.3]));
    expect(peaks).toEqual([]);
    expect(dips).toEqual([]);
  });

  it('chooses a mode from the character of the painting', () => {
    const base = readLandscape(flatWorld());
    expect(chooseMode({ ...base, water: 0.6 })).toBe('yu');
    expect(chooseMode({ ...base, fire: 0.6 })).toBe('zhi');
    expect(chooseMode({ ...base, rugged: 0.6 })).toBe('shang');
    expect(chooseMode({ ...base, mean: 0.7 })).toBe('jue');
    expect(chooseMode(base)).toBe('gong');
  });
});
