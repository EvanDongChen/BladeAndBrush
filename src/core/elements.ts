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
  color: (c) => shade(96, 128, 150, c.aux),
});
registerElement({
  ...base,
  id: El.FIRE,
  name: 'fire',
  kind: 'gas',
  density: 1,
  color: (c) => shade(214, 84 + (c.life & 63), 40, c.aux),
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
