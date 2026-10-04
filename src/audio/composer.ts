/**
 * The composer plays the scroll like a musician reading it from left to right, one slice per beat.
 * Height sets the pitch on a pentatonic scale, so the melody follows the skyline. Peaks get a long
 * dizi (bamboo flute) note, dips drop to a low guqin note, steep slopes get a gliding slide, flat
 * ground rests, and water, fire and birds add runs, quicker notes and bell chimes.
 *
 * This is the endless version that follows the live World after the painting's own song
 * (song.ts) has finished.
 *
 * Pure and deterministic: the same seed and the same landscapes give the same notes, so a level
 * always sounds like itself. No Web Audio in here.
 */
import { hashSeed, Rng } from '../core/rng';
import { STEPS, type Landscape } from './profile';
import { chooseMode, chooseRoot, degreeToMidi, type ModeName } from './theory';

/**
 * 古筝 guzheng, 琵琶 pipa and 古琴 guqin are plucked strings (strings.ts); 'harmonic' is a guqin
 * 泛音, a string touched at a node so only a bell-like overtone sounds. 笛子 dizi is the bamboo
 * flute, 二胡 erhu the bowed fiddle. 'chime' is a small bell, 'muyu' the 木魚 woodblock, 'drum' a
 * 堂鼓 barrel drum and 'gong' the 鑼 gong.
 */
export type Voice = 'guzheng' | 'pipa' | 'guqin' | 'harmonic' | 'dizi' | 'erhu' | 'chime' | 'muyu' | 'drum' | 'gong';

export interface Note {
  /** Offset from the start of the step, in beats (a step lasts one beat). */
  beat: number;
  /** Length in beats. */
  dur: number;
  midi: number;
  voice: Voice;
  /** Loudness, 0..1. */
  vel: number;
  /** Start this many semitones away and slide into the pitch (a guzheng-style glide). */
  slide?: number;
  /** Plucked strings: press the string after the pluck to bend up this many semitones (按音). */
  bend?: number;
  /** Winds: a quick grace note this many semitones above, falling onto the pitch (倚音). */
  grace?: number;
}

const MIN_DEGREE = 0;
const MAX_DEGREE = 14;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class Composer {
  readonly root: number;
  mode: ModeName = 'gong';
  /** The melody's current scale degree, counted up from the root an octave above it. */
  degree = 5;

  constructor(readonly seed: number) {
    this.root = chooseRoot(seed);
  }

  /** MIDI note of a melody degree. */
  melodyMidi(degree: number): number {
    return degreeToMidi(this.root + 12, this.mode, clamp(degree, MIN_DEGREE, MAX_DEGREE));
  }

  /** Scale degree a height maps to: low ground sings low, tall peaks sing high. */
  static targetDegree(height: number): number {
    return Math.round(height * 9) + 2;
  }

  /** The notes of one step. `index` counts steps since the music began and wraps around the scroll. */
  step(land: Landscape, index: number): Note[] {
    this.mode = chooseMode(land);
    const i = ((index % STEPS) + STEPS) % STEPS;
    const rng = new Rng(hashSeed(this.seed, 'step', index));
    const h = land.heights[i];
    const dh = h - land.heights[Math.max(0, i - 1)];
    const isPeak = land.peaks.includes(i);
    const isDip = land.dips.includes(i);
    const notes: Note[] = [];

    // Melody: walk toward the height's degree (at most two degrees a step), leap on peaks and dips.
    const target = Composer.targetDegree(h);
    let next = this.degree + clamp(target - this.degree, -2, 2);
    if (isPeak) next = target + 2;
    else if (isDip) next = target - 1;
    this.degree = clamp(next, MIN_DEGREE, MAX_DEGREE);

    // Bass: the root every eight steps, the fifth halfway, and always in a dip.
    if (i % 8 === 0 || isDip) notes.push({ beat: 0, dur: 3.5, midi: degreeToMidi(this.root, this.mode, 0), voice: 'guqin', vel: 0.55 });
    else if (i % 8 === 4) notes.push({ beat: 0, dur: 3, midi: degreeToMidi(this.root, this.mode, 3), voice: 'guqin', vel: 0.45 });

    const rest = !isPeak && Math.abs(dh) < 0.015 && rng.chance(0.35);
    if (!rest) {
      const steep = Math.abs(dh) > 0.12;
      notes.push({
        beat: 0,
        dur: isPeak ? 3.2 : 1.8,
        midi: this.melodyMidi(this.degree),
        voice: isPeak ? 'dizi' : 'guzheng',
        vel: isPeak ? 0.75 : 0.55 + rng.range(0, 0.2),
        slide: steep ? (dh > 0 ? -2 : 2) : undefined,
      });
      // a quicker passing note toward the next slice, more often on rough ground and near fire
      if (!isPeak && rng.chance(0.3 + land.rugged * 0.4 + land.fire * 0.2)) {
        const ahead = Composer.targetDegree(land.heights[(i + 1) % STEPS]);
        const dir = Math.sign(ahead - this.degree) || (rng.chance(0.5) ? 1 : -1);
        notes.push({ beat: 0.5, dur: 1, midi: this.melodyMidi(this.degree + dir), voice: 'guzheng', vel: 0.4 });
      }
    }

    // Over water the guzheng sweeps upward in a quick run every eight steps.
    if (land.water > 0.15 && i % 8 === 6) {
      for (let k = 0; k < 4; k++) {
        notes.push({ beat: 0.4 + k * 0.12, dur: 1.2, midi: this.melodyMidi(this.degree - 4 + k * 2), voice: 'guzheng', vel: 0.3 + 0.05 * k });
      }
    }

    // Birds and butterflies make a bell chime now and then.
    if (land.birds > 0 && rng.chance(0.03 + 0.12 * land.birds)) {
      notes.push({ beat: rng.range(0.2, 0.9), dur: 0.8, midi: this.melodyMidi(this.degree + 5) + 12, voice: 'chime', vel: 0.4 });
    }

    return notes;
  }
}
