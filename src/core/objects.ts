import { ExtensionRegistry } from './registry';
import type { World } from './world';

/**
 * Object tracking: which cells belong to which thing (a mountain, a tree, the moon, a hut, a
 * villager...). Every World cell carries an object id in `obj` (0 = none) next to its element. The
 * id follows the cell's material wherever it moves (swap, falling, rigid pieces, creatures walking)
 * and is cleared when the cell is overwritten with something new (World.set without `obj`), so
 * "the cells of object 7" always means the material that object is still made of.
 *
 * The generator gives ids out (FeatureCtx.newStroke) and records each object in the blueprint
 * registry. Generated material's object is the stroke that painted it, so the reveal (and a layer
 * moving forward in the stack) sets obj = owner. The frontier turns registry entries into
 * WorldObjects as it passes. Metrics read them through indexObjects(); sim behaviors may add to an
 * object's `stats` (e.g. rain landing on it).
 *
 * Unlike `owner` (the art stroke a cell was painted by, which creatures reuse for their color),
 * `obj` means the same thing for every element.
 */
export interface WorldObject {
  id: number;
  /** What it is: 'mountain', 'tree', 'rock', 'moon', 'hut', 'village', 'villager', 'bird'... */
  kind: string;
  /** Free-form labels metrics can select on, e.g. 'village' or 'captive'. */
  tags: readonly string[];
  /** For creatures: the element its cells are made of (0 for terrain and other painted things). */
  el: number;
  /** Anchor in cells (a mountain's peak, a creature's spawn point, the center of the moon). */
  x: number;
  y: number;
  bbox: readonly [x0: number, y0: number, x1: number, y1: number];
  /** Cells carrying this id when it was revealed (0 for creatures, which are placed by the sim). */
  cells: number;
  /** Counters the sim adds to (e.g. stats.rain). Part of World.hash(), so keep them deterministic. */
  stats: Record<string, number>;
  /** The object it stands on or belongs to (a tree's mountain), 0 if none. */
  group: number;
}

/** Does the object carry this tag? */
export function hasTag(o: WorldObject, tag: string): boolean {
  return o.tags.includes(tag);
}

/** Add to one of an object's counters. Safe to call with id 0 or an unknown id (does nothing). */
export function addStat(world: World, id: number, stat: string, n = 1): void {
  if (id === 0) return;
  const o = world.objects.get(id);
  if (o) o.stats[stat] = (o.stats[stat] ?? 0) + n;
}

/** Objects of one kind (or with one tag, if `tag` is given), in reveal order. */
export function objectsOf(world: World, kind: string | null, tag?: string): WorldObject[] {
  const out: WorldObject[] = [];
  for (const o of world.objects.values()) if ((kind === null || o.kind === kind) && (tag === undefined || hasTag(o, tag))) out.push(o);
  return out;
}

// ---------------------------------------------------------------- placing creatures

export interface PlaceOpts {
  obj: number;
  variant?: number;
  face?: number;
}

/**
 * Puts a self-moving thing (a creature) into the world. The sim registers one per creature
 * element, so the generator can ask for "a person here" without importing the sim.
 */
export interface Placer {
  el: number;
  /** Returns false if there was no room. */
  place(world: World, x: number, y: number, opts: PlaceOpts): boolean;
}

export const placers = new ExtensionRegistry<Placer>('placer', (p) => p.el);

export function registerPlacer(p: Placer): Placer {
  return placers.register(p);
}

// ---------------------------------------------------------------- reading cells by object

/** One pass over the grid: how many cells each object id still has, and where. */
export interface ObjectIndex {
  /** Cells currently carrying `id` (any element), or only those of element `el`. */
  count(id: number, el?: number): number;
  /** Some cell index of `id` (the first in row-major order), or -1 if it has none left. */
  firstCell(id: number): number;
  /** Bounding box of the cells still carrying `id`, or null. */
  bbox(id: number): [number, number, number, number] | null;
  /** Is it still there? Creatures: any cell of their element. Everything else: any cell at all. */
  alive(o: WorldObject): boolean;
}

/** Build an ObjectIndex for the world as it is now. O(cells); scan() builds one per scan. */
export function indexObjects(world: World): ObjectIndex {
  let maxId = 0;
  for (const id of world.objects.keys()) maxId = Math.max(maxId, id);
  const n = maxId + 1;
  const total = new Uint32Array(n);
  const first = new Int32Array(n).fill(-1);
  const x0 = new Int32Array(n).fill(world.w);
  const y0 = new Int32Array(n).fill(world.h);
  const x1 = new Int32Array(n).fill(-1);
  const y1 = new Int32Array(n).fill(-1);
  // per-element counts only for creatures (their el), so the table stays small
  const creatureEl = new Uint8Array(n);
  for (const o of world.objects.values()) creatureEl[o.id] = o.el;
  const ownEl = new Uint32Array(n);

  const { obj, el, w, size } = world;
  for (let i = 0; i < size; i++) {
    const id = obj[i];
    if (id === 0 || id >= n) continue;
    total[id]++;
    if (creatureEl[id] !== 0 && el[i] === creatureEl[id]) ownEl[id]++;
    if (first[id] < 0) first[id] = i;
    const x = i % w;
    const y = (i / w) | 0;
    if (x < x0[id]) x0[id] = x;
    if (x > x1[id]) x1[id] = x;
    if (y < y0[id]) y0[id] = y;
    if (y > y1[id]) y1[id] = y;
  }

  const countEl = (id: number, e: number): number => {
    if (creatureEl[id] === e) return ownEl[id];
    let c = 0;
    for (let i = 0; i < size; i++) if (obj[i] === id && el[i] === e) c++;
    return c;
  };

  return {
    count: (id, e) => (id <= 0 || id >= n ? 0 : e === undefined ? total[id] : countEl(id, e)),
    firstCell: (id) => (id <= 0 || id >= n ? -1 : first[id]),
    bbox: (id) => (id <= 0 || id >= n || x1[id] < 0 ? null : [x0[id], y0[id], x1[id], y1[id]]),
    alive: (o) => (o.id >= n ? false : o.el !== 0 ? ownEl[o.id] > 0 : total[o.id] > 0),
  };
}
