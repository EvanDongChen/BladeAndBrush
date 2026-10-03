import { ExtensionRegistry } from './registry';

/**
 * Element ids. APPEND-ONLY: never renumber, never reuse.
 * Ranges: 9-31 reserved for B (sim), 32-63 reserved for A (gen), 64+ future (mist, hut, bridge, bird...).
 * Extension elements declare an explicit id in their range via registerElement() and do not need
 * to be added here.
 */
export enum El {
  EMPTY = 0,
  ROCK = 1, // mountain ink. static, solid
  TREE = 2, // static, solid, flammable
  WATER = 3, // liquid
  FIRE = 4, // short-lived, rises, ignites neighbors
  SMOKE = 5, // gas, decorative
  ASH = 6, // powder, left behind by burnt trees
  SPLAT = 7, // flying ink droplet (ballistic), becomes STAIN
  STAIN = 8, // settled ink splatter. visual only, NOT solid for scanning
}

export type Kind = 'empty' | 'static' | 'powder' | 'liquid' | 'gas' | 'projectile';

/** Read-only view of one cell, handed to color(). The renderer reuses a single object: do not keep it. */
export interface CellView {
  x: number;
  y: number;
  el: number;
  life: number;
  aux: number;
  owner: number;
  flags: number;
  /** World tick, for animated colors (shimmer, flicker). Rendering only; the sim never reads it from here. */
  tick: number;
}

export interface ElementDef {
  id: number;
  name: string;
  kind: Kind;
  /** For displacement (heavier sinks through lighter). */
  density: number;
  /** 0..1 chance per tick to ignite when adjacent to fire. */
  flammability: number;
  /** Counts toward heightAt() and the scanner's silhouette. */
  solidForScan: boolean;
  /** Packed RGBA (see rgba()). May use aux/life/owner for variation. */
  color: (cell: CellView) => number;
}

/** Pack a color for a little-endian Uint32Array view over ImageData. */
export function rgba(r: number, g: number, b: number, a = 255): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Per-cell shade jitter from aux (0..255): scales rgb by roughly 0.88..1.12. */
export function shade(r: number, g: number, b: number, aux: number, a = 255): number {
  const k = 0.88 + (aux / 255) * 0.24;
  const c = (v: number) => Math.min(255, Math.round(v * k));
  return rgba(c(r), c(g), c(b), a);
}

/** Cheap deterministic hash of three ints to 0..255, for animated color noise (glints, flicker). */
export function hash3(x: number, y: number, t: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(t, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) & 255;
}

/** One full sine cycle over 256 steps, for wave shimmer. Index with `& 255`. */
export const SIN256 = new Float32Array(256).map((_, i) => Math.sin((i / 256) * Math.PI * 2));

/** Scale an rgb color by k (clamped), packed like rgba(). */
export function scaled(r: number, g: number, b: number, k: number, a = 255): number {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return rgba(c(r), c(g), c(b), a);
}

/**
 * Water: two slow ripples crossing each other brighten and darken the surface, and the odd cell
 * catches a pale glint that changes every few ticks.
 */
function waterColor(c: CellView): number {
  if ((hash3(c.x, c.y, c.tick >> 3) & 63) === 0) return rgba(206, 228, 240);
  const a = SIN256[(c.x * 7 + c.y * 11 + c.tick * 3) & 255];
  const b = SIN256[(c.x * 5 - c.y * 9 - c.tick * 2) & 255];
  const jitter = 0.94 + (c.aux / 255) * 0.12; // subdued per-cell variation so the waves read
  return scaled(96, 128, 150, (1 + 0.06 * (a + b)) * jitter);
}

/** Fire from smoldering red through orange to yellow-white, indexed by how much life is left. */
const FIRE_RAMP = (() => {
  const stops: [number, number, number, number][] = [
    [0, 92, 24, 20],
    [0.25, 186, 46, 24],
    [0.55, 236, 116, 34],
    [0.8, 250, 184, 72],
    [1, 255, 238, 176],
  ];
  const ramp = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    const t = i / 63;
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const [t0, r0, g0, b0] = stops[s];
    const [t1, r1, g1, b1] = stops[s + 1];
    const f = (t - t0) / (t1 - t0);
    ramp[i] = rgba(Math.round(r0 + (r1 - r0) * f), Math.round(g0 + (g1 - g0) * f), Math.round(b0 + (b1 - b0) * f));
  }
  return ramp;
})();

/**
 * Fire is colored by its remaining life: fresh flame is yellow-white, then orange, then red, then
 * a dark ember just before it goes out. Free flames (aux 0) are short-lived and burning fuel lasts
 * longer, so each gets its own scale. A little per-cell flicker shifts the shade every other tick.
 */
function fireColor(c: CellView): number {
  const span = c.aux === 0 ? 26 : 48;
  const flicker = (hash3(c.x, c.y, c.tick >> 1) & 15) - 8;
  const t = Math.max(0, Math.min(1, c.life / span + flicker * 0.012));
  return FIRE_RAMP[(t * 63 + 0.5) | 0];
}

export const elements = new ExtensionRegistry<ElementDef>('element', (e) => e.id, (e) => `${e.id} ${e.name}`);

/** Indexed by element id. Undefined for ids nobody registered. */
export const ELEMENTS: (ElementDef | undefined)[] = new Array(256).fill(undefined);
/** Hot-loop lookup: 1 if the element counts for heightAt()/scan. */
export const SOLID_FOR_SCAN = new Uint8Array(256);

const names = new Set<string>();

/** Throws on a duplicate id or name, so collisions surface at startup. */
export function registerElement(def: ElementDef): ElementDef {
  if (!Number.isInteger(def.id) || def.id < 0 || def.id > 255) {
    throw new Error(`Element "${def.name}" has id ${def.id}; ids must be integers 0..255`);
  }
  if (names.has(def.name)) throw new Error(`Duplicate element name "${def.name}"`);
  elements.register(def);
  names.add(def.name);
  ELEMENTS[def.id] = def;
  SOLID_FOR_SCAN[def.id] = def.solidForScan ? 1 : 0;
  return def;
}

export function elementName(id: number): string {
  return ELEMENTS[id]?.name ?? `#${id}`;
}

// ---- built-in elements (ids 0-8) ----

const base = { density: 0, flammability: 0, solidForScan: false };

registerElement({ ...base, id: El.EMPTY, name: 'empty', kind: 'empty', color: () => 0 });
registerElement({
  ...base,
  id: El.ROCK,
  name: 'rock',
  kind: 'static',
  density: 100,
  solidForScan: true,
  color: (c) => shade(46, 43, 40, c.aux),
});
registerElement({
  ...base,
  id: El.TREE,
  name: 'tree',
  kind: 'static',
  density: 100,
  flammability: 0.6,
  solidForScan: true,
  color: (c) => shade(44, 62, 46, c.aux),
});
registerElement({
  ...base,
  id: El.WATER,
  name: 'water',
  kind: 'liquid',
  density: 10,
  color: waterColor,
});
registerElement({
  ...base,
  id: El.FIRE,
  name: 'fire',
  kind: 'gas',
  density: 1,
  color: fireColor,
});
registerElement({
  ...base,
  id: El.SMOKE,
  name: 'smoke',
  kind: 'gas',
  density: 0.5,
  color: (c) => shade(160, 158, 154, c.aux),
});
registerElement({
  ...base,
  id: El.ASH,
  name: 'ash',
  kind: 'powder',
  density: 5,
  color: (c) => shade(124, 118, 112, c.aux),
});
registerElement({
  ...base,
  id: El.SPLAT,
  name: 'splat',
  kind: 'projectile',
  density: 8,
  color: (c) => shade(22, 20, 20, c.aux),
});
registerElement({
  ...base,
  id: El.STAIN,
  name: 'stain',
  kind: 'static',
  color: (c) => shade(78, 72, 66, c.aux),
});
