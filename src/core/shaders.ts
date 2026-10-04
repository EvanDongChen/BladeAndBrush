import { El, ELEMENTS, elements } from './elements';
import { createNoise } from './noise';
import { ExtensionRegistry } from './registry';
import { hashSeed } from './rng';

/**
 * Shaders: how sim cells that are NOT showing the generator's art are drawn (water, fire, loose
 * rock, smoke...). They run at art resolution with soft edges, so everything looks like the
 * painting. Drop a file into core/shaders/ that calls registerShader(). Elements are named, so
 * core never imports sim/ or gen/. Elements without a shader (the hand-made sprites) keep their
 * per-pixel color() look.
 */

export type TexName = 'flow' | 'hatch' | 'cloud';

/** What a shader sees for one art pixel. One object is reused for every pixel: do not keep it. */
export interface ShadePx {
  /** Art pixel and its cell. */
  x: number;
  y: number;
  cx: number;
  cy: number;
  /** Position inside the cell, 0..1. */
  fx: number;
  fy: number;
  /** Soft-edge coverage 0..1 (the framework multiplies the returned alpha by it). */
  cover: number;
  /** Raw neighbour blend: ~1 deep inside a body, ~0.5 right on its edge. */
  v: number;
  /** For `run` shaders: how deep in its body, 0 at the open surface to 1 at RUN_DEPTH cells in or deeper. */
  depth: number;
  /** The cell above is not part of this body (it is a surface). */
  topEdge: boolean;
  tick: number;
  aux: number;
  life: number;
  /** Cell index. */
  i: number;
  /** The element's own color(cell) for this cell, as a palette. */
  base: number;
  /** Texture lookup, 0..1, tiles every 256 px. */
  tex(name: TexName, u: number, v: number): number;
}

export interface Shader {
  /** Element name(s) this shader draws. */
  element: string | string[];
  /** Cells of the same family merge their edges (default: the element itself). */
  family?: string;
  /** Compute `depth` as the distance through each connected body of the family to its open surface. */
  run?: boolean;
  /** The shader ignores `base` (skips the per-pixel color blending between neighbouring cells). */
  noBase?: boolean;
  /**
   * The output depends only on the cells (not on the tick), so a body at rest is drawn once and
   * then left alone. Leave it off for anything that moves on its own (water, fire, smoke).
   */
  static?: boolean;
  /** Packed RGBA; alpha is its own opacity (multiplied by coverage). */
  shade(p: ShadePx): number;
}

export const shaders = new ExtensionRegistry<Shader>('shader', (s) => (Array.isArray(s.element) ? s.element.join(',') : s.element));

export function registerShader(s: Shader): Shader {
  return shaders.register(s);
}

// ---- resolution: names -> element ids, once per registry change ----

export const SHADER: (Shader | undefined)[] = new Array(256).fill(undefined);
/** 1 if the element has a shader (the plain cells layer skips these when shading is on). */
export const SHADED = new Uint8Array(256);
/** Family id per element (elements sharing a family merge their edges). */
export const FAMILY = new Uint8Array(256);
export const RUN = new Uint8Array(256);
let resolvedKey = '';
export let anyShader = false;

export function resolveShaders(): void {
  const key = `${shaders.version}/${elements.version}`;
  if (key === resolvedKey) return;
  resolvedKey = key;
  SHADER.fill(undefined);
  SHADED.fill(0);
  RUN.fill(0);
  for (let e = 0; e < 256; e++) FAMILY[e] = e;
  const byName = new Map<string, number>();
  for (const d of ELEMENTS) if (d) byName.set(d.name, d.id);
  anyShader = false;
  for (const s of shaders.all()) {
    const names = Array.isArray(s.element) ? s.element : [s.element];
    const fam = s.family !== undefined ? byName.get(s.family) : undefined;
    for (const n of names) {
      const id = byName.get(n);
      if (id === undefined || id === El.EMPTY) continue;
      SHADER[id] = s;
      SHADED[id] = 1;
      RUN[id] = s.run ? 1 : 0;
      if (fam !== undefined) FAMILY[id] = fam;
      anyShader = true;
    }
  }
}

// ---- helpers ----

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const byte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
export const pack = (r: number, g: number, b: number, a = 255) => ((byte(a) << 24) | (byte(b) << 16) | (byte(g) << 8) | byte(r)) >>> 0;
/** Blend two packed colors (alpha too). */
export function mix(c0: number, c1: number, t: number): number {
  return pack(
    lerp(c0 & 255, c1 & 255, t),
    lerp((c0 >>> 8) & 255, (c1 >>> 8) & 255, t),
    lerp((c0 >>> 16) & 255, (c1 >>> 16) & 255, t),
    lerp(c0 >>> 24, c1 >>> 24, t),
  );
}
/** Scale rgb, keep alpha. */
export function dim(c: number, k: number): number {
  return pack((c & 255) * k, ((c >>> 8) & 255) * k, ((c >>> 16) & 255) * k, c >>> 24);
}
export const withAlpha = (c: number, a: number) => ((c & 0xffffff) | (byte(a) << 24)) >>> 0;
export const PAPER_COLOR = pack(240, 233, 216);

// ---- stroke textures: tileable, deterministic, built once ----

const SIZE = 256;

/** Tileable value noise on an nx x ny lattice, `oct` octaves, as 0..255. */
function buildTexture(name: TexName, nx: number, ny: number, oct: number, sharpen: number): Uint8Array {
  const noise = createNoise(hashSeed('shader-texture', name));
  const lat = new Float32Array(nx * ny);
  const rnd = (i: number, j: number, o: number) => noise.n2(i * 7.31 + o * 13.7, j * 5.17 + o * 3.3);
  const out = new Uint8Array(SIZE * SIZE);
  for (let o = 0; o < oct; o++) {
    const px = nx << o;
    const py = ny << o;
    const L = new Float32Array(px * py);
    for (let j = 0; j < py; j++) for (let i = 0; i < px; i++) L[j * px + i] = rnd(i, j, o);
    const amp = 1 / (1 << o);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const fx = (x / SIZE) * px;
        const fy = (y / SIZE) * py;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const a = L[(iy % py) * px + (ix % px)];
        const b = L[(iy % py) * px + ((ix + 1) % px)];
        const c = L[((iy + 1) % py) * px + (ix % px)];
        const d = L[((iy + 1) % py) * px + ((ix + 1) % px)];
        const v = lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
        out[y * SIZE + x] += Math.round(v * amp * 255 * (o === 0 ? 0.65 : 0.35 / oct));
      }
    }
  }
  void lat;
  // push toward 0 / 1 so strokes read as strokes, not haze
  for (let i = 0; i < out.length; i++) {
    const t = out[i] / 255;
    out[i] = Math.round(smoothstep(0.5 - 0.5 / sharpen, 0.5 + 0.5 / sharpen, t) * 255);
  }
  return out;
}

let flowTex: Uint8Array | null = null;
let hatchTex: Uint8Array | null = null;
let cloudTex: Uint8Array | null = null;

/**
 * The texture's 256x256 bytes (0..255), for shaders that sample it in their inner loop: index
 * `((Math.floor(v) & 255) << 8) | (Math.floor(u) & 255)`, divide by 255.
 */
export function texture(name: TexName): Uint8Array {
  if (name === 'flow') return flowTex ?? (flowTex = buildNamed(name));
  if (name === 'hatch') return hatchTex ?? (hatchTex = buildNamed(name));
  return cloudTex ?? (cloudTex = buildNamed(name));
}

function buildNamed(name: TexName): Uint8Array {
  // flow: long thin horizontal streaks; hatch: fine strokes; cloud: soft blobs
  return name === 'flow' ? buildTexture(name, 5, 56, 2, 1.8) : name === 'hatch' ? buildTexture(name, 9, 70, 2, 2.4) : buildTexture(name, 8, 8, 3, 1.1);
}

export function sampleTexture(name: TexName, u: number, v: number): number {
  return texture(name)[((Math.floor(v) & 255) << 8) | (Math.floor(u) & 255)] / 255;
}
