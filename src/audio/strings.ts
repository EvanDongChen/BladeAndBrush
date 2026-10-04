/**
 * Plucked strings by Karplus-Strong: a burst of noise runs round a delay line one period long, and
 * a gentle lowpass in the loop takes the high partials away first, the way a real string rings
 * down. The three plucked instruments are one algorithm with different strings:
 *
 *   古筝 guzheng: bright steel strings plucked near the bridge, long ring.
 *   琵琶 pipa:    brighter and shorter, with a hard fingernail attack.
 *   古琴 guqin:   dark silk strings plucked mid-string, the longest ring.
 *
 * Pure: renders into a Float32Array from the seeded RNG, so the same note always has the same
 * samples and everything here is testable. synth.ts wraps the result in an AudioBuffer.
 */
import { hashSeed, Rng } from '../core/rng';

export type StringKind = 'guzheng' | 'pipa' | 'guqin';

interface StringSpec {
  /** Seconds for the fundamental to fall 60 dB. */
  t60: number;
  /** Loop lowpass weight, 0..0.5: higher darkens the string faster. */
  damp: number;
  /** Excitation lowpass, 0..1: 1 keeps the whole noise burst, lower softens the pluck. */
  bright: number;
  /** Where along the string it is plucked, 0..0.5 (near the bridge = thin and bright). */
  pos: number;
  /** Fingernail click mixed into the first milliseconds, 0..1. */
  click: number;
  /** Length of the rendered sample in seconds. */
  len: number;
}

const SPECS: Record<StringKind, StringSpec> = {
  guzheng: { t60: 3.2, damp: 0.42, bright: 0.85, pos: 0.13, click: 0.25, len: 3.2 },
  pipa: { t60: 1.1, damp: 0.38, bright: 1, pos: 0.1, click: 0.6, len: 1.4 },
  guqin: { t60: 4.5, damp: 0.5, bright: 0.45, pos: 0.27, click: 0.05, len: 4 },
};

/** Sample rate the strings are rendered at. Nothing above 12 kHz matters here, and it halves memory. */
export const STRING_RATE = 24000;

export function stringLength(kind: StringKind): number {
  return SPECS[kind].len;
}

/** Render one plucked note, normalised to a peak of 1 and faded to silence at the end. */
export function renderString(kind: StringKind, hz: number, rate = STRING_RATE): Float32Array<ArrayBuffer> {
  const spec = SPECS[kind];
  const out = new Float32Array(Math.floor(spec.len * rate));
  const rng = new Rng(hashSeed('string', kind, Math.round(hz * 100)));

  // Total loop delay must be one period: integer delay line + the loop lowpass (damp samples)
  // + a first-order allpass for the fraction, kept in its stable, flat range [0.1, 1.1).
  const period = rate / hz;
  let n = Math.floor(period - spec.damp);
  let frac = period - spec.damp - n;
  if (frac < 0.1 && n > 2) {
    n -= 1;
    frac += 1;
  }
  const c = (1 - frac) / (1 + frac);
  const gain = Math.pow(10, -3 / (spec.t60 * hz));

  // Excitation: lowpassed noise, then a comb at the pluck position (that partial and its
  // multiples are missing when you pluck there), then remove the DC so the string does not drift.
  const line = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += spec.bright * (rng.next() * 2 - 1 - lp);
    line[i] = lp;
  }
  const shift = Math.max(1, Math.round(spec.pos * n));
  const exc = Float32Array.from(line);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    line[i] = exc[i] - exc[(i - shift + n) % n];
    mean += line[i];
  }
  mean /= n;
  for (let i = 0; i < n; i++) line[i] -= mean;

  let idx = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < out.length; i++) {
    const cur = line[idx];
    const filtered = (1 - spec.damp) * cur + spec.damp * prev;
    prev = cur;
    const ap = c * filtered + apX - c * apY;
    apX = filtered;
    apY = ap;
    line[idx] = ap * gain;
    idx = idx + 1 === n ? 0 : idx + 1;
    out[i] = cur;
  }

  // Fingernail (or plectrum) click: a few milliseconds of bright noise on the attack.
  const clickLen = Math.floor(rate * 0.004);
  for (let i = 0; i < clickLen && i < out.length; i++) out[i] += spec.click * (rng.next() * 2 - 1) * (1 - i / clickLen);

  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const norm = peak > 0 ? 1 / peak : 0;
  const fade = Math.floor(rate * 0.08);
  for (let i = 0; i < out.length; i++) {
    const tail = out.length - i;
    out[i] *= norm * (tail < fade ? tail / fade : 1);
  }
  return out;
}
