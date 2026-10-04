/**
 * The painting's song: when a scroll is generated, it gets a short piece of its own for a small
 * Chinese ensemble, composed from the blueprint before a single column is revealed.
 *
 *   Intro   a low 古琴 guqin note, a 鑼 gong under tall mountains or guqin harmonics under a moon,
 *           then a 古筝 guzheng sweep up the scale (longer and falling back over water).
 *   Scroll  one beat per slice, left to right. The lead follows the skyline: peaks leap and get a
 *           pressed bend or a tremolo, dips fall, steep slopes glide. Under it the accompaniment
 *           plays broken chords that change every eight slices. What the generator placed adds its
 *           own sound where it stands: woodblock for a village, a quick flute trill for birds, a
 *           falling sweep for a spring, guqin harmonics for the moon, a light pluck for trees.
 *   Cadence the lead walks home to the tonic, the guzheng rolls a chord and the gong or a bell ends it.
 *
 * The painting picks the mode (theory.ts), the mode picks the lead (with the seed choosing between
 * two), and the seed picks the key, so a level always sounds like itself and a slider change gives
 * a new tune. Pure and deterministic; no Web Audio in here.
 */
import type { Blueprint } from '../core/blueprint';
import { hashSeed, Rng } from '../core/rng';
import type { Note, Voice } from './composer';
import { readLandscape, STEPS, type Landscape } from './profile';
import { chooseMode, chooseRoot, degreeToMidi, tempoBpm, type ModeName } from './theory';

export type Lead = 'guzheng' | 'dizi' | 'erhu' | 'pipa' | 'guqin';

/** Something the generator placed, at `at` (0..1) across the scroll. */
export interface Mark {
  at: number;
  kind: string;
}

export interface Scroll {
  land: Landscape;
  marks: Mark[];
}

export interface Song {
  root: number;
  mode: ModeName;
  lead: Lead;
  bpm: number;
  /** Sorted by beat. Beats count from the start of the song. */
  notes: Note[];
  /** The beats over which the song crosses the scroll from left to right. */
  scroll: [start: number, end: number];
  /** Beats until the last note has rung out. */
  length: number;
}

/** Each mode has two leads that suit it; the seed picks one. */
const LEADS: Record<ModeName, [Lead, Lead]> = {
  gong: ['guzheng', 'dizi'], // calm ground
  shang: ['dizi', 'pipa'], // rugged ground
  jue: ['guqin', 'erhu'], // tall, solemn mountains
  zhi: ['pipa', 'dizi'], // fire
  yu: ['erhu', 'guzheng'], // water
};

/** Octave each lead plays in, relative to the melody register. */
const LEAD_SHIFT: Record<Lead, number> = { guzheng: 0, dizi: 0, erhu: 0, pipa: 0, guqin: -12 };

/** Beats of intro before the song reaches the left edge of the scroll. */
export const INTRO = 4;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Read a blueprint: the whole skyline, plus everything the generator placed and where. */
export function readScroll(bp: Blueprint): Scroll {
  const land = readLandscape(bp);
  const marks: Mark[] = [];
  for (const s of bp.registry.strokes.values()) marks.push({ at: clamp(s.anchor[0] / bp.w, 0, 1), kind: s.kind });
  for (const s of bp.registry.waterSources) marks.push({ at: clamp(s.x / bp.w, 0, 1), kind: 'spring' });
  marks.sort((a, b) => a.at - b.at || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  // Creatures and springs are not cells yet at generation time, so count them from the marks.
  const count = (...kinds: string[]) => marks.filter((m) => kinds.includes(m.kind)).length;
  land.birds = Math.max(land.birds, Math.min(1, count('bird', 'butterfly') / 6));
  land.people = Math.max(land.people, Math.min(1, count('person', 'villager') / 4));
  land.water = Math.max(land.water, Math.min(1, count('spring') * 0.4));
  return { land, marks };
}

/** Compose the song for a scroll. Same scroll and seed, same song. */
export function composeSong(scroll: Scroll, seed: number): Song {
  const { land } = scroll;
  const rng = new Rng(hashSeed(seed, 'song'));
  const mode = chooseMode(land);
  const root = chooseRoot(seed);
  const lead = LEADS[mode][rng.int(2)];
  const accomp: Voice = lead === 'guzheng' ? 'guqin' : 'guzheng';
  const bpm = Math.round(tempoBpm(land) + 6 + rng.range(-4, 4));
  const notes: Note[] = [];
  const add = (n: Note) => notes.push(n);

  /** Melody register (degree 0 = an octave above the root). */
  const mel = (d: number) => degreeToMidi(root + 12, mode, clamp(Math.round(d), 0, 14));
  /** Bass register (degree 0 = an octave below the root). */
  const low = (d: number) => degreeToMidi(root - 12, mode, d);
  const leadMidi = (d: number) => mel(d) + LEAD_SHIFT[lead];
  /** Semitones from degree d up to the next degree: a bend that always lands in the mode. */
  const stepUp = (d: number) => mel(d + 1) - mel(d);

  // What stands in each slice (each kind once per slice, so a forest does not drown the tune).
  const bySlice: Set<string>[] = Array.from({ length: STEPS }, () => new Set());
  for (const m of scroll.marks) bySlice[Math.min(STEPS - 1, Math.floor(m.at * STEPS))].add(m.kind);
  const has = (i: number, ...kinds: string[]) => kinds.some((k) => bySlice[i].has(k));
  const moon = scroll.marks.some((m) => m.kind === 'moon');
  const tall = land.mean > 0.45 || land.peaks.length >= 3;

  // ---- intro ----
  add({ beat: 0, dur: 6, midi: low(0), voice: 'guqin', vel: 0.7 });
  if (tall) add({ beat: 0, dur: 6, midi: root - 12, voice: 'gong', vel: 0.35 });
  add({ beat: 1.5, dur: 4, midi: low(3), voice: 'guqin', vel: 0.45 });
  if (moon) {
    add({ beat: 1, dur: 3, midi: mel(5) + 12, voice: 'harmonic', vel: 0.4 });
    add({ beat: 2, dur: 3, midi: mel(8) + 12, voice: 'harmonic', vel: 0.35 });
  }
  // 刮奏: a guzheng sweep up to where the melody starts, falling back again over water.
  const start = clamp(Math.round(land.heights[0] * 9) + 2, 2, 11);
  const sweep = land.water > 0.15 ? 12 : 8;
  for (let k = 0; k < sweep; k++) {
    add({ beat: 2.2 + k * 0.1, dur: 2.5, midi: mel(start - sweep + k + 1), voice: 'guzheng', vel: 0.25 + (0.3 * k) / sweep });
  }
  if (land.water > 0.15) {
    for (let k = 0; k < 6; k++) add({ beat: 3.4 + k * 0.08, dur: 2, midi: mel(start - k), voice: 'guzheng', vel: 0.3 - k * 0.03 });
  }

  // ---- crossing the scroll ----
  let degree = start;
  let held: Note | null = null; // a sustained lead note that the next slice may tie into
  let prevMidi = leadMidi(degree);
  const sustained = lead === 'dizi' || lead === 'erhu';
  const phraseHarmony = [0, 0, 0, 0];
  for (let p = 1; p < 4; p++) {
    let m = 0;
    for (let i = p * 8; i < p * 8 + 8; i++) m += land.heights[i] / 8;
    phraseHarmony[p] = p === 3 ? (rng.chance(0.5) ? 1 : 3) : m > land.mean ? 3 : rng.chance(0.5) ? 4 : 1;
  }

  for (let i = 0; i < STEPS; i++) {
    const b = INTRO + i;
    const hgt = land.heights[i];
    const dh = hgt - land.heights[Math.max(0, i - 1)];
    const isPeak = land.peaks.includes(i);
    const isDip = land.dips.includes(i);
    const target = Math.round(hgt * 9) + 2;
    let next = degree + clamp(target - degree, -2, 2);
    if (isPeak) next = target + 2;
    else if (isDip) next = target - 1;
    degree = clamp(next, 0, 14);
    const midi = leadMidi(degree);
    const steep = Math.abs(dh) > 0.12;

    // Lead.
    const rest = !isPeak && i > 0 && Math.abs(dh) < 0.015 && rng.chance(0.3);
    if (sustained) {
      if (held && held.midi === midi && !isPeak && held.dur < 2.5) held.dur += 1; // same note: keep the breath / bow going
      else if (rest) held = null;
      else {
        const leap: number = midi - prevMidi;
        held = {
          beat: b,
          dur: isPeak ? 2.5 : 1.1,
          midi,
          voice: lead,
          vel: isPeak ? 0.8 : 0.55 + rng.range(0, 0.15),
          // the erhu slides between near notes
          slide: lead === 'erhu' && Math.abs(leap) > 0 && Math.abs(leap) <= 5 ? -leap : undefined,
          // the dizi gets a grace note on peaks, leaps and repeated notes (a held note re-tongued)
          grace: lead === 'dizi' && (isPeak || leap === 0 || Math.abs(leap) > 4) ? stepUp(degree) : undefined,
        };
        add(held);
        prevMidi = midi;
      }
    } else if (!rest) {
      const pluckVoice = lead as Voice;
      if (isPeak && lead === 'pipa') {
        // 輪指: the pipa's tremolo, swelling then falling away
        for (let k = 0; k < 12; k++) add({ beat: b + k / 8, dur: 0.4, midi, voice: 'pipa', vel: 0.35 + 0.3 * Math.sin((Math.PI * k) / 12) });
      } else {
        add({
          beat: b,
          dur: isPeak ? 3 : 1.6,
          midi,
          voice: pluckVoice,
          vel: isPeak ? 0.8 : 0.55 + rng.range(0, 0.2),
          slide: steep ? (dh > 0 ? -stepUp(degree - 1) : stepUp(degree)) : undefined,
          // 按音: press the string after the pluck so the note bends up to the next degree
          bend: isPeak && lead === 'guzheng' ? stepUp(degree) : undefined,
        });
      }
      if (!isPeak && rng.chance(0.25 + land.rugged * 0.4)) {
        const ahead = Math.round(land.heights[Math.min(STEPS - 1, i + 1)] * 9) + 2;
        const dir = Math.sign(ahead - degree) || (rng.chance(0.5) ? 1 : -1);
        add({ beat: b + 0.5, dur: 1, midi: leadMidi(degree + dir), voice: pluckVoice, vel: 0.4 });
      }
      prevMidi = midi;
    }

    // A peak under a plucked lead gets a long dizi note above it.
    if (isPeak && !sustained && lead !== 'pipa') {
      add({ beat: b + 0.25, dur: 2.2, midi: mel(degree), voice: 'dizi', vel: 0.4, grace: stepUp(degree) });
    }

    // Accompaniment: a broken chord every two slices on the phrase's harmony.
    if (i % 2 === 0) {
      const hd = phraseHarmony[i >> 3];
      if (accomp === 'guzheng') {
        const shape = [0, 3, 5, 3];
        for (let k = 0; k < 4; k++) add({ beat: b + k * 0.5, dur: 1.5, midi: low(hd + shape[k]) + 12, voice: 'guzheng', vel: k === 0 ? 0.38 : 0.26 });
      } else {
        add({ beat: b, dur: 3, midi: low(hd), voice: 'guqin', vel: 0.45 });
        add({ beat: b + 1, dur: 2, midi: low(hd + 5), voice: 'guqin', vel: 0.3 });
      }
    }
    if (i % 8 === 0 && land.rugged > 0.55) add({ beat: b, dur: 1, midi: root - 24, voice: 'drum', vel: 0.6 });

    // What the generator placed here.
    if (has(i, 'hut', 'village')) {
      for (const [o, v] of [[0, 0.5], [0.5, 0.35], [0.75, 0.35]] as const) add({ beat: b + o, dur: 0.3, midi: mel(9), voice: 'muyu', vel: v });
    }
    if (has(i, 'person', 'villager')) {
      add({ beat: b + 0.25, dur: 0.6, midi: mel(degree + 2), voice: 'pipa', vel: 0.3 });
      add({ beat: b + 0.375, dur: 0.6, midi: mel(degree + 1), voice: 'pipa', vel: 0.25 });
    }
    if (has(i, 'bird', 'butterfly')) {
      // a bird call: two light plucks, a step apart, above the melody
      add({ beat: b + 0.5, dur: 0.8, midi: mel(degree + 4), voice: 'guzheng', vel: 0.3 });
      add({ beat: b + 0.67, dur: 1.2, midi: mel(degree + 5), voice: 'guzheng', vel: 0.35 });
    }
    if (has(i, 'spring')) {
      for (let k = 0; k < 6; k++) add({ beat: b + 0.3 + k * 0.09, dur: 1.6, midi: mel(degree + 6 - k), voice: 'guzheng', vel: 0.3 - k * 0.03 });
    }
    if (has(i, 'moon')) {
      add({ beat: b + 0.5, dur: 3, midi: mel(degree + 5) + 12, voice: 'harmonic', vel: 0.4 });
      add({ beat: b + 1.5, dur: 3, midi: mel(degree + 3) + 12, voice: 'harmonic', vel: 0.3 });
    }
    if (has(i, 'tree', 'bamboo', 'flower') && rng.chance(0.25 + 0.3 * land.trees)) {
      add({ beat: b + 0.75, dur: 1.2, midi: mel(degree + 3), voice: accomp === 'guzheng' ? 'guzheng' : 'guqin', vel: 0.2 });
    }
  }

  // ---- cadence: walk home to the tonic ----
  const end = INTRO + STEPS;
  const home = 5;
  let t = end;
  let d = degree;
  while (d !== home) {
    d += Math.sign(home - d);
    if (d !== home) {
      add({ beat: t, dur: 1, midi: leadMidi(d), voice: lead, vel: 0.5 });
      t += 0.5;
    }
  }
  add({ beat: t, dur: 5, midi: leadMidi(home), voice: lead, vel: 0.75 });
  for (let k = 0; k < 5; k++) add({ beat: t + k * 0.08, dur: 5, midi: low([0, 3, 5, 7, 10][k]) + 12, voice: 'guzheng', vel: 0.4 });
  add({ beat: t, dur: 6, midi: low(0), voice: 'guqin', vel: 0.6 });
  if (tall) add({ beat: t, dur: 6, midi: root - 12, voice: 'gong', vel: 0.5 });
  else add({ beat: t + 0.5, dur: 2, midi: mel(10), voice: 'chime', vel: 0.4 });

  notes.sort((a, b) => a.beat - b.beat);
  return { root, mode, lead, bpm, notes, scroll: [INTRO, end], length: t + 6 };
}

/** Read a blueprint and compose its song in one go. */
export function songFor(bp: Blueprint): Song {
  return composeSong(readScroll(bp), bp.seed);
}
