/**
 * Chinese pentatonic theory: the five modes (調式) of 宮 商 角 徵 羽, pitch helpers, and how a
 * painting picks its key and mode. Pure functions, no Web Audio, so everything here is testable.
 */
import type { Landscape } from './profile';

export type ModeName = 'gong' | 'shang' | 'jue' | 'zhi' | 'yu';

/** Semitone offsets of each mode's five degrees. Each is a rotation of the same pentatonic set. */
export const MODES: Record<ModeName, readonly number[]> = {
  gong: [0, 2, 4, 7, 9], // bright, open: calm ground
  shang: [0, 2, 5, 7, 10], // clear, slightly restless: rugged ground
  jue: [0, 3, 5, 8, 10], // dark, solemn: tall mountains
  zhi: [0, 2, 5, 7, 9], // lively, rising: fire
  yu: [0, 3, 5, 7, 10], // soft, watery, a little sad: rivers and ponds
};

/** Tonics (MIDI) the melody can sit on: D3, E3, G3, A3. The melody lives an octave above. */
export const ROOTS: readonly number[] = [50, 52, 55, 57];

export const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** MIDI note of a scale degree. Degrees count upward from the root and may be negative. */
export function degreeToMidi(root: number, mode: ModeName, degree: number): number {
  const set = MODES[mode];
  const d = Math.round(degree);
  const octave = Math.floor(d / set.length);
  const idx = d - octave * set.length;
  return root + octave * 12 + set[idx];
}

/** True if the MIDI note belongs to the mode on this root, in any octave. */
export function inMode(root: number, mode: ModeName, midi: number): boolean {
  const pc = (((midi - root) % 12) + 12) % 12;
  return MODES[mode].includes(pc);
}

/** What the painting is like decides the mode. Checked in this order. */
export function chooseMode(land: Landscape): ModeName {
  if (land.water > 0.35) return 'yu';
  if (land.fire > 0.25) return 'zhi';
  if (land.rugged > 0.55) return 'shang';
  if (land.mean > 0.5) return 'jue';
  return 'gong';
}

/** The tonic stays fixed for a seed, so the same level always sounds like the same place. */
export function chooseRoot(seed: number): number {
  return ROOTS[(seed >>> 0) % ROOTS.length];
}

/** Beats per minute: slow and open over calm ground, quicker over rough ground and fire. */
export function tempoBpm(land: Landscape): number {
  return 54 + land.rugged * 26 + land.fire * 18;
}
