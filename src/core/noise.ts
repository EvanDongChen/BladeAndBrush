import { Rng } from './rng';

/**
 * Our own seeded value noise with fractal (octave) sums. Original code; no third-party noise.
 * All outputs are in [0, 1).
 */
export interface Noise {
  n1(x: number): number;
  n2(x: number, y: number): number;
  /** Fractal sum. Ruggedness maps to octaves and falloff. */
  fbm1(x: number, octaves?: number, falloff?: number): number;
  fbm2(x: number, y: number, octaves?: number, falloff?: number): number;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function createNoise(seed: number): Noise {
  const rng = new Rng(seed);
  const perm = new Uint8Array(512);
  const vals = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rng.next();
  }
  for (let i = 255; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  const at1 = (ix: number) => vals[perm[ix & 255]];
  const at2 = (ix: number, iy: number) => vals[perm[perm[ix & 255] + (iy & 255)]];

  const n1 = (x: number) => {
    const x0 = Math.floor(x);
    return lerp(at1(x0), at1(x0 + 1), fade(x - x0));
  };

  const n2 = (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const u = fade(x - x0);
    const v = fade(y - y0);
    return lerp(lerp(at2(x0, y0), at2(x0 + 1, y0), u), lerp(at2(x0, y0 + 1), at2(x0 + 1, y0 + 1), u), v);
  };

  const fbm1 = (x: number, octaves = 4, falloff = 0.5) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n1(x * f + o * 17.3);
      norm += amp;
      amp *= falloff;
      f *= 2;
    }
    return sum / norm;
  };

  const fbm2 = (x: number, y: number, octaves = 4, falloff = 0.5) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n2(x * f + o * 17.3, y * f - o * 9.1);
      norm += amp;
      amp *= falloff;
      f *= 2;
    }
    return sum / norm;
  };

  return { n1, n2, fbm1, fbm2 };
}
