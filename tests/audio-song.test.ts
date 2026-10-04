import { describe, expect, it } from 'vitest';
import { fitRange, TOP, type Voice } from '../src/audio/composer';
import { STEPS, type Landscape } from '../src/audio/profile';
import { composeSong, INTRO, readScroll, songFor, type Mark, type Scroll } from '../src/audio/song';
import { renderString } from '../src/audio/strings';
import { inMode } from '../src/audio/theory';
import { generate } from '../src/gen/generate';
import { defaultParams } from '../src/core/params';
import './helpers';

const DIMS = { w: 320, h: 100 };

function land(over: Partial<Landscape> = {}, heights?: (i: number) => number): Landscape {
  const h = new Float32Array(STEPS);
  for (let i = 0; i < STEPS; i++) h[i] = heights ? heights(i) : 0.3;
  return { heights: h, peaks: [], dips: [], mean: 0.3, rugged: 0.1, water: 0, fire: 0, trees: 0, birds: 0, people: 0, ...over };
}

function scroll(over: Partial<Landscape> = {}, marks: Mark[] = []): Scroll {
  return { land: land(over, (i) => 0.3 + 0.2 * Math.sin(i / 3)), marks };
}

const UNPITCHED: Voice[] = ['muyu', 'drum', 'gong'];
const inSlice = (beat: number, i: number) => beat >= INTRO + i && beat < INTRO + i + 1;

describe('plucked strings', () => {
  it('renders the same samples every time, peaking at 1', () => {
    const a = renderString('guzheng', 220);
    expect(Array.from(a.subarray(0, 500))).toEqual(Array.from(renderString('guzheng', 220).subarray(0, 500)));
    let peak = 0;
    for (const v of a) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeCloseTo(1, 5);
  });

  it('rings at the pitch asked for', () => {
    const rate = 24000;
    for (const hz of [110, 330, 880]) {
      const s = renderString('guzheng', hz, rate).subarray(2400, 2400 + 4800);
      // the lag with the strongest self-similarity near one period is the period
      const guess = rate / hz;
      let best = 0;
      let bestLag = 0;
      for (let lag = Math.floor(guess * 0.9); lag <= Math.ceil(guess * 1.1); lag++) {
        let sum = 0;
        for (let i = 0; i + lag < s.length; i++) sum += s[i] * s[i + lag];
        if (sum > best) [best, bestLag] = [sum, lag];
      }
      expect(Math.abs(bestLag - guess)).toBeLessThanOrEqual(1);
    }
  });

  it('dies away, the pipa sooner than the guqin', () => {
    const tailEnergy = (s: Float32Array) => {
      let e = 0;
      for (let i = Math.floor(s.length * 0.5); i < Math.floor(s.length * 0.6); i++) e += s[i] * s[i];
      return e;
    };
    const head = (s: Float32Array) => {
      let e = 0;
      for (let i = 0; i < Math.floor(s.length * 0.1); i++) e += s[i] * s[i];
      return e;
    };
    for (const kind of ['guzheng', 'pipa', 'guqin'] as const) {
      const s = renderString(kind, 196);
      expect(tailEnergy(s)).toBeLessThan(head(s) * 0.5);
    }
    expect(renderString('pipa', 196).length).toBeLessThan(renderString('guqin', 196).length);
  });
});

describe('the painting song', () => {
  it('is the same for the same scroll and seed, and differs across seeds', () => {
    const s = scroll();
    expect(composeSong(s, 5)).toEqual(composeSong(s, 5));
    expect(composeSong(s, 5).notes).not.toEqual(composeSong(s, 6).notes);
  });

  it('is sorted, crosses the scroll after the intro, and has rung out by its length', () => {
    const song = composeSong(scroll({ water: 0.5 }, [{ at: 0.5, kind: 'moon' }]), 3);
    expect(song.scroll).toEqual([INTRO, INTRO + STEPS]);
    for (let k = 1; k < song.notes.length; k++) expect(song.notes[k].beat).toBeGreaterThanOrEqual(song.notes[k - 1].beat);
    for (const n of song.notes) expect(n.beat + n.dur).toBeLessThanOrEqual(song.length + 0.01);
    expect(song.bpm).toBeGreaterThan(40);
    expect(song.bpm).toBeLessThan(110);
  });

  it('keeps every pitched note in the mode, and ends the lead on the tonic', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const song = composeSong(scroll({ rugged: (seed % 4) * 0.2, water: seed % 3 === 0 ? 0.5 : 0 }), seed);
      for (const n of song.notes) {
        if (UNPITCHED.includes(n.voice)) continue;
        expect(inMode(song.root, song.mode, n.midi)).toBe(true);
        if (n.bend) expect(inMode(song.root, song.mode, n.midi + n.bend)).toBe(true);
      }
      const last = song.notes.filter((n) => n.voice === song.lead).at(-1)!;
      expect((((last.midi - song.root) % 12) + 12) % 12).toBe(0);
    }
  });

  it('nothing plays above its voice\'s range, and folding keeps the pitch class', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const song = composeSong(scroll({ water: seed % 2 ? 0.6 : 0, rugged: 0.7 }, [{ at: 0.3, kind: 'bird' }, { at: 0.6, kind: 'moon' }]), seed);
      for (const n of song.notes) {
        const m = fitRange(n.voice, n.midi);
        expect(m).toBeLessThanOrEqual(TOP[n.voice]);
        expect((((m - n.midi) % 12) + 12) % 12).toBe(0);
      }
    }
    expect(fitRange('dizi', 100)).toBeLessThanOrEqual(TOP.dizi);
    expect(fitRange('dizi', 70)).toBe(70);
  });

  it('the painting picks the mode and the lead', () => {
    const watery = composeSong(scroll({ water: 0.6 }), 1);
    expect(watery.mode).toBe('yu');
    expect(['erhu', 'guzheng']).toContain(watery.lead);
    const calm = composeSong(scroll({ rugged: 0, mean: 0.2 }), 1);
    expect(calm.mode).toBe('gong');
    expect(['guzheng', 'dizi']).toContain(calm.lead);
  });

  it('what the generator placed plays where it stands', () => {
    const marks: Mark[] = [
      { at: 3.5 / STEPS, kind: 'village' },
      { at: 12.5 / STEPS, kind: 'bird' },
      { at: 20.5 / STEPS, kind: 'moon' },
      { at: 27.5 / STEPS, kind: 'spring' },
    ];
    const song = composeSong(scroll({}, marks), 9);
    const at = (i: number) => song.notes.filter((n) => inSlice(n.beat, i) || inSlice(n.beat - 0.5, i));
    expect(at(3).some((n) => n.voice === 'muyu')).toBe(true);
    expect(at(12).filter((n) => n.voice === 'guzheng' && n.vel <= 0.35).length).toBeGreaterThanOrEqual(2);
    expect(at(20).some((n) => n.voice === 'harmonic')).toBe(true);
    expect(at(27).filter((n) => n.voice === 'guzheng').length).toBeGreaterThanOrEqual(6);
    expect(composeSong(scroll(), 9).notes.some((n) => n.voice === 'muyu')).toBe(false);
  });

  it('reads a generated blueprint: its strokes become marks and the song is deterministic', () => {
    const bp = generate(11, defaultParams(), { dims: DIMS, k: 1 });
    const s = readScroll(bp);
    expect(s.land.heights).toHaveLength(STEPS);
    expect(s.marks.length).toBe(bp.registry.strokes.size + bp.registry.waterSources.length);
    for (const m of s.marks) {
      expect(m.at).toBeGreaterThanOrEqual(0);
      expect(m.at).toBeLessThanOrEqual(1);
    }
    expect(songFor(bp)).toEqual(songFor(generate(11, defaultParams(), { dims: DIMS, k: 1 })));
    expect(songFor(bp).notes.length).toBeGreaterThan(40);
  }, 60000);
});
