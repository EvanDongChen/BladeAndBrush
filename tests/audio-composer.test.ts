import { describe, expect, it } from 'vitest';
import { Composer } from '../src/audio/composer';
import { findExtrema, readLandscape, STEPS, type Landscape } from '../src/audio/profile';
import { inMode, tempoBpm } from '../src/audio/theory';
import { El } from '../src/core/elements';
import { World } from '../src/core/world';
import { blueprintWorld } from './helpers';

const base = (heights: number[]): Landscape => {
  const h = Float32Array.from(heights);
  const { peaks, dips } = findExtrema(h);
  return { heights: h, peaks, dips, mean: 0.4, rugged: 0.2, water: 0, fire: 0, trees: 0, birds: 0, people: 0 };
};

const skyline = base(Array.from({ length: STEPS }, (_, i) => 0.3 + 0.25 * Math.sin(i / 3)));

function play(seed: number, land: Landscape, steps: number) {
  const c = new Composer(seed);
  return Array.from({ length: steps }, (_, i) => c.step(land, i));
}

describe('composer', () => {
  it('is deterministic for a seed and landscape', () => {
    expect(play(7, skyline, 64)).toEqual(play(7, skyline, 64));
  });

  it('sounds different for a different seed or a different landscape', () => {
    expect(play(7, skyline, 64)).not.toEqual(play(8, skyline, 64));
    expect(play(7, skyline, 64)).not.toEqual(play(7, base(Array(STEPS).fill(0.6)), 64));
  });

  it('keeps every note inside the pentatonic mode', () => {
    const c = new Composer(3);
    for (let i = 0; i < 96; i++) {
      for (const n of c.step(skyline, i)) expect(inMode(c.root, c.mode, n.midi)).toBe(true);
    }
  });

  it('plays a flute note on a peak and a bass note in a dip', () => {
    const heights = Array(STEPS).fill(0.2);
    heights[10] = 0.8; // peak
    heights[20] = 0.0; // a dip needs ground above it, so lift its surroundings
    for (const k of [17, 18, 19, 21, 22, 23]) heights[k] = 0.5;
    const land = base(heights);
    expect(land.peaks).toContain(10);
    expect(land.dips).toContain(20);
    const c = new Composer(1);
    const all = Array.from({ length: STEPS }, (_, i) => c.step(land, i));
    expect(all[10].some((n) => n.voice === 'flute')).toBe(true);
    expect(all[20].some((n) => n.voice === 'bass')).toBe(true);
  });

  it('the melody moves stepwise except on peaks and dips', () => {
    const c = new Composer(5);
    let prev = c.degree;
    for (let i = 0; i < STEPS; i++) {
      c.step(skyline, i);
      if (!skyline.peaks.includes(i) && !skyline.dips.includes(i)) expect(Math.abs(c.degree - prev)).toBeLessThanOrEqual(2);
      prev = c.degree;
    }
  });

  it('keeps note offsets inside the step and velocities in range', () => {
    for (const notes of play(2, { ...skyline, water: 0.5, birds: 1 }, 64)) {
      for (const n of notes) {
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(1);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('water adds a guzheng run', () => {
    const wet = play(2, { ...skyline, water: 0.6 }, STEPS);
    const dry = play(2, skyline, STEPS);
    const count = (s: ReturnType<typeof play>) => s.flat().filter((n) => n.voice === 'pluck').length;
    expect(count(wet)).toBeGreaterThan(count(dry));
  });

  it('plays the generated painting and follows carving', () => {
    const w = blueprintWorld(1);
    const before = play(1, readLandscape(w), 32);
    for (let x = 300; x < 420; x++) for (let y = 0; y < w.h; y++) if (w.get(x, y) === El.ROCK) w.set(x, y, El.EMPTY);
    const after = play(1, readLandscape(w), 32);
    expect(after).not.toEqual(before);
  });

  it('plays slower over calm ground than over rough ground and fire', () => {
    expect(tempoBpm({ ...skyline, rugged: 0, fire: 0 })).toBeLessThan(tempoBpm({ ...skyline, rugged: 1, fire: 1 }));
  });

  it('does not touch the world', () => {
    const w: World = blueprintWorld(1);
    const h = w.hash();
    readLandscape(w);
    expect(w.hash()).toBe(h);
  });
});
