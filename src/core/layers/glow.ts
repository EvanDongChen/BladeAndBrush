import { hash3 } from '../elements';
import { GLOW } from '../glow';
import { registerLayer } from '../render';
import type { World } from '../world';

/** The glow is computed on blocks of GLOW_SCALE x GLOW_SCALE cells, then scaled up smoothly. */
export const GLOW_SCALE = 4;
const SHIFT = 2; // log2(GLOW_SCALE)
/** Blur radius of each band, in blocks (the near halo is ~8 cells wide, the far one ~20). */
const NEAR_RADIUS = 2;
const FAR_RADIUS = 5;
const BLUR_PASSES = 2;
/** How fast the halo's opacity saturates with energy. Tuned by eye. */
const NEAR_GAIN = 0.55;
const FAR_GAIN = 2.2;

/**
 * Light energy per block, in four planes of lw*lh per band: r*e, g*e, b*e and e itself (so the
 * color stays the energy-weighted average after blurring).
 */
export interface GlowField {
  lw: number;
  lh: number;
  near: Float32Array;
  far: Float32Array;
  /** True if any cell glows (otherwise there is nothing to draw). */
  any: boolean;
}

export function createGlowField(): GlowField {
  return { lw: 0, lh: 0, near: new Float32Array(0), far: new Float32Array(0), any: false };
}

/** Running-window box blur of one line of `n` samples (zero outside), from `src` to `dst`. */
function blurLine(src: Float32Array, dst: Float32Array, start: number, stride: number, n: number, r: number): void {
  const inv = 1 / (2 * r + 1);
  let sum = 0;
  for (let k = 0; k <= r && k < n; k++) sum += src[start + k * stride];
  for (let k = 0; k < n; k++) {
    dst[start + k * stride] = sum * inv;
    const add = k + r + 1;
    const rem = k - r;
    if (add < n) sum += src[start + add * stride];
    if (rem >= 0) sum -= src[start + rem * stride];
  }
}

let scratch = new Float32Array(0);

/**
 * Blur the band, working only inside the box of blocks that can be non-zero: the lit blocks' box
 * [x0, x1] x [y0, y1], grown by the radius at each pass (outside it everything is zero anyway).
 */
function blurBand(band: Float32Array, lw: number, lh: number, r: number, x0: number, y0: number, x1: number, y1: number): void {
  if (scratch.length < band.length) scratch = new Float32Array(band.length);
  const plane = lw * lh;
  for (let p = 0; p < 4; p++) {
    const off = p * plane;
    let xa = x0;
    let xb = x1;
    let ya = y0;
    let yb = y1;
    for (let pass = 0; pass < BLUR_PASSES; pass++) {
      // the box's rows spread sideways into scratch
      xa = Math.max(0, xa - r);
      xb = Math.min(lw - 1, xb + r);
      const n = xb - xa + 1;
      for (let y = ya; y <= yb; y++) blurLine(band, scratch, off + y * lw + xa, 1, n, r);
      // then its columns spread up and down (scratch rows just outside the box are zero)
      const yc = Math.max(0, ya - r);
      const yd = Math.min(lh - 1, yb + r);
      for (let y = yc; y < ya; y++) scratch.fill(0, off + y * lw + xa, off + y * lw + xb + 1);
      for (let y = yb + 1; y <= yd; y++) scratch.fill(0, off + y * lw + xa, off + y * lw + xb + 1);
      ya = yc;
      yb = yd;
      for (let x = xa; x <= xb; x++) blurLine(scratch, band, off + ya * lw + x, lw, yb - ya + 1, r);
    }
  }
}

/**
 * Add up the light of every glowing cell into low-res blocks, then blur the near and far bands.
 * Deterministic for a given world (the flicker comes from the tick, not from any RNG).
 */
export function buildGlowField(world: World, f: GlowField): GlowField {
  const lw = Math.ceil(world.w / GLOW_SCALE);
  const lh = Math.ceil(world.h / GLOW_SCALE);
  if (f.lw !== lw || f.lh !== lh) {
    f.lw = lw;
    f.lh = lh;
    f.near = new Float32Array(lw * lh * 4);
    f.far = new Float32Array(lw * lh * 4);
  }
  f.near.fill(0);
  f.far.fill(0);
  f.any = false;

  const { el, life, aux, w, size, tick } = world;
  const table = GLOW;
  const { near, far } = f;
  const plane = lw * lh;
  let bx0 = lw;
  let by0 = lh;
  let bx1 = -1;
  let by1 = -1;
  for (let i = 0; i < size; i++) {
    const spec = table[el[i]];
    if (spec === undefined) continue;
    const x = i % w;
    const y = (i / w) | 0;
    let level = spec.level ? spec.level(life[i], aux[i]) : 1;
    level *= 0.8 + (hash3(x, y, tick >> 1) / 255) * 0.4; // flicker
    if (level <= 0) continue;
    const bx = x >> SHIFT;
    const by = y >> SHIFT;
    if (bx < bx0) bx0 = bx;
    if (bx > bx1) bx1 = bx;
    if (by < by0) by0 = by;
    if (by > by1) by1 = by;
    const j = by * lw + bx;
    const en = level * spec.near;
    const ef = level * spec.far;
    near[j] += spec.r * en;
    near[plane + j] += spec.g * en;
    near[2 * plane + j] += spec.b * en;
    near[3 * plane + j] += en;
    far[j] += spec.r * ef;
    far[plane + j] += spec.g * ef;
    far[2 * plane + j] += spec.b * ef;
    far[3 * plane + j] += ef;
    f.any = true;
  }
  if (f.any) {
    blurBand(near, lw, lh, NEAR_RADIUS, bx0, by0, bx1, by1);
    blurBand(far, lw, lh, FAR_RADIUS, bx0, by0, bx1, by1);
  }
  return f;
}

/** Turn a blurred band into straight-alpha RGBA: average color, opacity rising with energy. */
function paintBand(band: Float32Array, img: ImageData, lw: number, lh: number, gain: number): void {
  const d = img.data;
  const plane = lw * lh;
  for (let j = 0; j < plane; j++) {
    const e = band[3 * plane + j];
    const o = j * 4;
    if (e < 0.002) {
      d[o + 3] = 0;
      continue;
    }
    const inv = 1 / e;
    d[o] = band[j] * inv;
    d[o + 1] = band[plane + j] * inv;
    d[o + 2] = band[2 * plane + j] * inv;
    d[o + 3] = 255 * (1 - Math.exp(-gain * e));
  }
}

interface Surfaces {
  lw: number;
  lh: number;
  nearCanvas: HTMLCanvasElement;
  farCanvas: HTMLCanvasElement;
  nearCtx: CanvasRenderingContext2D;
  farCtx: CanvasRenderingContext2D;
  nearImg: ImageData;
  farImg: ImageData;
}

let surfaces: Surfaces | null = null;
const field = createGlowField();

function ensureSurfaces(lw: number, lh: number): Surfaces | null {
  if (surfaces && surfaces.lw === lw && surfaces.lh === lh) return surfaces;
  const make = (): [HTMLCanvasElement, CanvasRenderingContext2D] | null => {
    const canvas = document.createElement('canvas');
    canvas.width = lw;
    canvas.height = lh;
    const ctx = canvas.getContext('2d');
    return ctx ? [canvas, ctx] : null;
  };
  const near = make();
  const far = make();
  if (!near || !far) return null;
  surfaces = {
    lw,
    lh,
    nearCanvas: near[0],
    nearCtx: near[1],
    nearImg: near[1].createImageData(lw, lh),
    farCanvas: far[0],
    farCtx: far[1],
    farImg: far[1].createImageData(lw, lh),
  };
  return surfaces;
}

/**
 * Soft 2D glow around every glowing cell (see core/glow.ts). The wide band tints what is around
 * the light (paper, rock, art) and the tight band blooms on top of it. Drawn over the cells and
 * the art, below the frontier marker and the cursor.
 */
registerLayer({
  name: 'glow',
  label: 'Glow',
  order: 25,
  kind: 'canvas',
  flag: 'glow',
  draw: ({ g, world }) => {
    buildGlowField(world, field);
    if (!field.any) return;
    const s = ensureSurfaces(field.lw, field.lh);
    if (!s) return;
    paintBand(field.far, s.farImg, field.lw, field.lh, FAR_GAIN);
    paintBand(field.near, s.nearImg, field.lw, field.lh, NEAR_GAIN);
    s.farCtx.putImageData(s.farImg, 0, 0);
    s.nearCtx.putImageData(s.nearImg, 0, 0);
    g.save();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.globalCompositeOperation = 'source-over';
    g.drawImage(s.farCanvas, 0, 0, field.lw, field.lh, 0, 0, world.w, world.h);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(s.nearCanvas, 0, 0, field.lw, field.lh, 0, 0, world.w, world.h);
    g.restore();
  },
});
