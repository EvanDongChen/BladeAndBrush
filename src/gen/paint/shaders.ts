import { rgba } from '../../core/elements';
import type { Noise } from '../../core/noise';
import type { Shader } from './painter';

const WHITE: [number, number, number] = [246, 241, 228];

/**
 * Opaque ink wash: a white occluder base tinted toward `ink` by `base`, darker within ~edgeWidth
 * pixels of the top edge, with noise speckle. Opaque so nearer shapes hide what is behind them.
 */
export function inkWash(o: {
  ink: [number, number, number];
  paper?: [number, number, number];
  base: number;
  edge: number;
  edgeWidth: number;
  speckle: number;
  noise: Noise;
  /** Speckle noise frequency per art pixel. */
  grain?: number;
}): Shader {
  const paper = o.paper ?? WHITE;
  const grain = o.grain ?? 0.35;
  const [pr, pg, pb] = paper;
  const dr = o.ink[0] - pr;
  const dg = o.ink[1] - pg;
  const db = o.ink[2] - pb;
  return (x, y, dTop) => {
    let a = o.base + o.edge * Math.exp(-dTop / o.edgeWidth);
    if (o.speckle > 0) a += o.speckle * (o.noise.n2(x * grain, y * grain) - 0.5);
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    return rgba((pr + dr * a + 0.5) | 0, (pg + dg * a + 0.5) | 0, (pb + db * a + 0.5) | 0);
  };
}

/**
 * inkWash plus contour bands: extra ink near each inner layer line of a mountain profile, which
 * reads as the stacked ridges of a shan-shui mountain. `layers[j][x - x0]` is a layer's art y
 * (or >= the canvas height where that layer is absent).
 */
export function contourWash(o: {
  ink: [number, number, number];
  paper?: [number, number, number];
  base: number;
  edge: number;
  edgeWidth: number;
  band: number;
  bandWidth: number;
  speckle: number;
  noise: Noise;
  x0: number;
  layers: Float32Array[];
  grain?: number;
  /** Atmospheric fade: between art y `from` and `to` the ink thins to nothing (still opaque). */
  mist?: { from: number; to: number };
}): Shader {
  const paper = o.paper ?? WHITE;
  const grain = o.grain ?? 0.35;
  const [pr, pg, pb] = paper;
  const dr = o.ink[0] - pr;
  const dg = o.ink[1] - pg;
  const db = o.ink[2] - pb;
  const mist = o.mist;
  const edgeCut = 8 * o.edgeWidth;
  const bandCut = 8 * o.bandWidth;
  return (x, y, dTop) => {
    // exp terms below ~e^-8 are invisible after 8-bit rounding: skip them.
    let a = o.base + (dTop < edgeCut ? o.edge * Math.exp(-dTop / o.edgeWidth) : 0);
    const j = x - o.x0;
    for (const layer of o.layers) {
      const d = y - layer[j];
      if (d >= 0 && d < bandCut) a += o.band * Math.exp(-d / o.bandWidth);
    }
    if (o.speckle > 0) a += o.speckle * (o.noise.n2(x * grain, y * grain) - 0.5);
    if (mist && y > mist.from) a *= Math.max(0, 1 - (y - mist.from) / (mist.to - mist.from));
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    return rgba((pr + dr * a + 0.5) | 0, (pg + dg * a + 0.5) | 0, (pb + db * a + 0.5) | 0);
  };
}

/**
 * Distant-ridge wash for the background plane: pale ink whose opacity fades to nothing toward the
 * foot (mist), so the paper shows through. Translucent on purpose; only the bg plane uses it.
 */
export function farWash(o: {
  ink: [number, number, number];
  /** Max opacity 0..1. */
  strength: number;
  edge: number;
  edgeWidth: number;
  noise: Noise;
  fadeFrom: number;
  fadeTo: number;
  grain?: number;
}): Shader {
  const grain = o.grain ?? 0.2;
  const [r, g, b] = o.ink;
  return (x, y, dTop) => {
    let a = o.strength * (0.7 + o.edge * Math.exp(-dTop / o.edgeWidth) + 0.15 * (o.noise.n2(x * grain, y * grain) - 0.5));
    if (y > o.fadeFrom) a *= Math.max(0, 1 - (y - o.fadeFrom) / (o.fadeTo - o.fadeFrom));
    return rgba(r, g, b, Math.round(Math.min(1, Math.max(0, a)) * 255));
  };
}
