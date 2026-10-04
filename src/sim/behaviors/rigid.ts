/**
 * Rigid pieces. Static solid material (rock, wood, leaf) that is no longer connected to the
 * bottom of the canvas becomes a body that falls as one piece, keeping its shape, until it lands.
 * Bodies can also be thrown (the push ability launches them with a velocity).
 *
 * A body moves one cell at a time. Fluids, gases and projectiles in its way are displaced to the
 * cells it vacates (so a rock dropped in a pond pushes the water up around it); anything else
 * solid, or the canvas edge, stops it. Once it is supported and has stopped sliding it turns back
 * into ordinary static terrain.
 *
 * Detection is not run every tick: anything that can remove support (slash, null, push, burnt
 * wood, the paint eraser) calls markUnsupported(world), and the next detection finds the pieces.
 * Burning wood (FIRE with a rigid fuel) still counts as solid until it burns out.
 */
import { registerPass } from '../../core/behaviors';
import { flagOn } from '../../core/config';
import { Flag } from '../../core/constants';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { DEBRIS } from '../elements/debris';
import { HANGING, K_GAS, K_LIQUID, K_PROJECTILE, KIND, REPLACEABLE, RIGID } from '../physics';
import { defineTunables } from '../tunables';
import { spawnDust } from './gas';

export const rigidTunables = defineTunables(
  'rigid',
  {
    /** Downward acceleration of falling pieces (cells per tick, per tick). Max fall speed is the gravity param. */
    gravity: 0.35,
    /** Horizontal speed kept per tick while sliding on the ground. */
    friction: 0.6,
    /** Fraction of horizontal speed kept (reversed) when hitting a wall. */
    bounce: 0.25,
    /** Ticks between support checks after something changed. */
    checkEvery: 4,
    /** Landing faster than this (cells per tick) rebounds instead of stopping. */
    impact: 2.5,
    /** Landing at least this fast kicks up dust and emits an 'impact' event. */
    dustSpeed: 1.2,
    /** Pieces this small (cells) or smaller crumble into rubble when they land. */
    crumbleSize: 12,
    /** How fast an overhanging piece starts to tip over its edge (radians per tick, per tick). */
    tip: 0.008,
    /** Fastest spin (radians per tick). */
    maxSpin: 0.15,
    /** Spin kept per tick while resting on something without tipping. */
    spinFriction: 0.5,
  },
  {
    gravity: [0.05, 1.5, 0.05],
    friction: [0, 1, 0.05],
    bounce: [0, 1, 0.05],
    checkEvery: [1, 30, 1],
    impact: [0.5, 12, 0.5],
    dustSpeed: [0.2, 6, 0.1],
    crumbleSize: [0, 200, 1],
    tip: [0, 0.05, 0.001],
    maxSpin: [0, 0.5, 0.01],
    spinFriction: [0, 1, 0.05],
  },
);

interface Body {
  id: number;
  /** Cell indices, kept sorted ascending. */
  cells: number[];
  /** The piece's shape at angle 0: offsets from its origin, aligned with `cells`. */
  ox: number[];
  oy: number[];
  /** Origin (world cells; fractional between rotations). cells = round(origin) + rotate(offsets, theta). */
  fx: number;
  fy: number;
  theta: number;
  /** Spin (radians per tick; positive = clockwise on screen). */
  omega: number;
  vx: number;
  vy: number;
  /** Sub-cell movement not yet applied. */
  ax: number;
  ay: number;
  /** Fraction of speed kept (reversed) when it hits something side-on or overhead. */
  bounce: number;
  /** Thrown pieces that are walled in and cannot move at all burst into rubble instead. */
  shatter: boolean;
  /** Ticks since launch. */
  age: number;
  /** Consecutive ticks it wanted to turn but could not move at all. */
  stuck: number;
}

interface State {
  /** Body id per cell (0 = none). */
  mark: Int32Array;
  bodies: Body[];
  byId: Map<number, Body>;
  nextId: number;
  dirty: boolean;
  lastCheck: number;
  /** world.promotions when last seen: a layer brought forward may have nothing under it. */
  promotions: number;
  /** Hanging objects (the moon) that have been cut apart: what is left of them never hangs again. */
  broken: Set<number>;
}

const states = new WeakMap<World, State>();

function state(world: World): State {
  let s = states.get(world);
  if (!s) {
    s = { mark: new Int32Array(world.size), bodies: [], byId: new Map(), nextId: 1, dirty: false, lastCheck: -1e9, promotions: 0, broken: new Set() };
    states.set(world, s);
  }
  return s;
}

/** Solid for support: rigid material, or rigid material that is currently burning. */
function solidAt(world: World, i: number): boolean {
  const e = world.el[i];
  return RIGID[e] === 1 || (e === El.FIRE && RIGID[world.aux[i]] === 1);
}

/** Something may have lost its support; check soon. */
export function markUnsupported(world: World): void {
  state(world).dirty = true;
}

/** Number of moving pieces (for tests and the sandbox status line). */
export function bodyCount(world: World): number {
  return states.get(world)?.bodies.length ?? 0;
}

/** Snapshot of the moving pieces, for debugging. */
export function bodyInfo(world: World): { cells: number; x: number; y: number; vx: number; vy: number; theta: number }[] {
  return (states.get(world)?.bodies ?? []).map((b) => ({
    cells: b.cells.length,
    x: Math.round(b.fx),
    y: Math.round(b.fy),
    vx: Math.round(b.vx * 100) / 100,
    vy: Math.round(b.vy * 100) / 100,
    theta: Math.round(b.theta * 100) / 100,
  }));
}

/**
 * Turn the given cells into one moving piece with a starting velocity (and spin). Cells that are
 * not solid, or already belong to a moving piece, are skipped. `bounce` defaults to
 * rigidTunables.bounce. With `shatter`, a piece that turns out to be walled in on all sides bursts
 * into flying rubble (DEBRIS) with its velocity instead of sitting still.
 */
export function launchBody(
  world: World,
  cells: number[],
  vx: number,
  vy: number,
  bounce = rigidTunables.bounce,
  shatter = false,
  spin = 0,
): void {
  const s = state(world);
  const own = cells.filter((i) => s.mark[i] === 0 && solidAt(world, i)).sort((a, b) => a - b);
  if (own.length === 0) return;
  const { w } = world;
  let mx = 0;
  let my = 0;
  for (const i of own) (mx += i % w), (my += (i / w) | 0);
  const fx = Math.round(mx / own.length);
  const fy = Math.round(my / own.length);
  const ox = own.map((i) => (i % w) - fx);
  const oy = own.map((i) => ((i / w) | 0) - fy);
  const body: Body = { id: s.nextId++, cells: own, ox, oy, fx, fy, theta: 0, omega: spin, vx, vy, ax: 0, ay: 0, bounce, shatter, age: 0, stuck: 0 };
  for (const i of own) s.mark[i] = body.id;
  s.bodies.push(body);
  s.byId.set(body.id, body);
  s.dirty = true; // what it was attached to may now hang free
}

// ---------------------------------------------------------------- detection

let stack = new Int32Array(0);
/** How far (cells) loose generated material looks for anchored material of its own object (Flag.CLING). */
const CLING_REACH = 6;
/** Per cell during detection: 0 = not free solid, 1 = free solid not yet visited, 2 = visited. */
let cellState = new Uint8Array(0);

function detect(world: World, s: State): void {
  const { w, h, size, el, aux, flags } = world;
  if (stack.length < size) {
    stack = new Int32Array(size);
    cellState = new Uint8Array(size);
  }
  // locals for the hot loops (imported bindings can be slow to read in some module loaders)
  const cell = cellState;
  const rigid = RIGID;
  const FIRE = El.FIRE;
  const { mark } = s;
  for (let i = 0; i < size; i++) {
    const e = el[i];
    cell[i] = mark[i] === 0 && (rigid[e] === 1 || (e === FIRE && rigid[aux[i]] === 1)) ? 1 : 0;
  }

  /** Flood from `start` through free solid cells, collecting them into `out` if given. */
  const flood = (start: number, out: number[] | null): void => {
    let top = 0;
    cell[start] = 2;
    stack[top++] = start;
    while (top > 0) {
      const i = stack[--top];
      if (out) out.push(i);
      const x = i % w;
      if (x > 0 && cell[i - 1] === 1) (cell[i - 1] = 2), (stack[top++] = i - 1);
      if (x < w - 1 && cell[i + 1] === 1) (cell[i + 1] = 2), (stack[top++] = i + 1);
      if (i >= w && cell[i - w] === 1) (cell[i - w] = 2), (stack[top++] = i - w);
      if (i < size - w && cell[i + w] === 1) (cell[i + w] = 2), (stack[top++] = i + w);
    }
  };

  // 1. everything solid connected to the bottom row, or to where generated land stands on its
  //    ground (Flag.FOOT: the painting has no ground strip), is anchored
  for (let i = (h - 1) * w; i < size; i++) if (cell[i] === 1) flood(i, null);
  for (let i = 0; i < size; i++) if (cell[i] === 1 && flags[i] & Flag.FOOT && !HANGING[el[i]]) flood(i, null); // (the moon is marked FOOT too, so that it stays painted; it holds itself up, see 1b)
  //    and so is generated material that clings (Flag.CLING): to anchored material within 2 cells,
  //    or to anchored material of its own object or of what it stands on within CLING_REACH (a canopy
  //    or a speck of a tree painted a little apart from its trunk or mountain; in front or behind)
  const { obj, behindOwner } = world;
  const groupOf = (id: number) => (id === 0 ? 0 : (world.objects.get(id)?.group ?? 0));
  const kin = (pos: number, id: number, group: number): boolean => {
    if (cell[pos] !== 2) return false;
    const o = obj[pos];
    if (o !== 0 && (o === id || o === group)) return true;
    if (flags[pos] & Flag.HAS_BEHIND) {
      for (const layer of behindOwner) {
        const b = layer[pos];
        if (b !== 0 && (b === id || b === group)) return true;
      }
    }
    return false;
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < size; i++) {
      if (cell[i] !== 1 || !(flags[i] & Flag.CLING)) continue;
      const x = i % w;
      const y = (i / w) | 0;
      const id = obj[i];
      const group = groupOf(id);
      let held = false;
      for (let dy = -CLING_REACH; dy <= CLING_REACH && !held; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -CLING_REACH; dx <= CLING_REACH; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const pos = ny * w + nx;
          const near = dx >= -2 && dx <= 2 && dy >= -2 && dy <= 2;
          if ((near && cell[pos] === 2) || (id !== 0 && kin(pos, id, group))) {
            held = true;
            break;
          }
        }
      }
      if (held) {
        flood(i, null);
        changed = true;
      }
    }
  }

  // 1b. hanging material (the moon, as a tracked object) stays up while it is one piece. Cut into two or more pieces,
  //     however small, every piece comes loose and falls. A piece held together only by thin necks
  //     (a slash that did not quite get through) counts as cut: it breaks apart at the necks.
  const hangingParts = new Map<number, number[][]>();
  for (let i = 0; i < size; i++) {
    if (cell[i] !== 1 || !HANGING[el[i]]) continue;
    const part: number[] = [];
    flood(i, part);
    const list = hangingParts.get(obj[i]);
    if (list) list.push(part);
    else hangingParts.set(obj[i], [part]);
  }
  for (const [id, parts] of hangingParts) {
    // Once cut apart (or untracked: no object holds it together) nothing of it hangs again, even a
    // lone piece that has come to rest on another that has since moved away.
    if (id === 0 || s.broken.has(id) || parts.length >= 2) {
      if (id !== 0) s.broken.add(id);
      for (const part of parts) for (const i of part) cell[i] = 1;
      continue;
    }
    const pieces = splitAtNecks(parts[0], w, size);
    if (pieces) {
      s.broken.add(id);
      for (const piece of pieces) launchBody(world, piece, 0, 0); // their cells stay out of step 2 below
    }
  }

  // 2. every other solid component becomes a falling body
  for (let i = 0; i < size; i++) {
    if (cell[i] !== 1) continue;
    const cells: number[] = [];
    flood(i, cells);
    launchBody(world, cells, 0, 0);
  }
  s.dirty = false;
}

/**
 * One connected piece that is really several chunks joined by thin necks (one or two cells wide):
 * the chunks, each neck cell going with its nearest chunk. Chunks are found as the connected
 * groups of interior cells (cells whose four neighbours are all in the piece), so a neck, which has
 * no interior, does not hold them together. Null if it is one chunk.
 */
function splitAtNecks(part: number[], w: number, size: number): number[][] | null {
  const inPart = new Uint8Array(size);
  for (const i of part) inPart[i] = 1;
  const label = new Int32Array(size);
  const core: number[] = [];
  for (const i of part) {
    const x = i % w;
    if (x > 0 && x < w - 1 && i >= w && i < size - w && inPart[i - 1] && inPart[i + 1] && inPart[i - w] && inPart[i + w]) core.push(i);
  }
  const isCore = (j: number) => inPart[j] === 1 && label[j] === 0 && coreSet.has(j);
  const coreSet = new Set(core);
  let chunks = 0;
  const todo: number[] = [];
  for (const c of core) {
    if (label[c] !== 0) continue;
    label[c] = ++chunks;
    todo.push(c);
    while (todo.length > 0) {
      const i = todo.pop()!;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (isCore(j)) {
          label[j] = chunks;
          todo.push(j);
        }
      }
    }
  }
  if (chunks < 2) return null;
  // grow the chunks over the necks and rims, nearest first
  const queue = core.slice();
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j >= 0 && j < size && inPart[j] === 1 && label[j] === 0) {
        label[j] = label[i];
        queue.push(j);
      }
    }
  }
  const out: number[][] = Array.from({ length: chunks }, () => []);
  for (const i of part) if (label[i] > 0) out[label[i] - 1].push(i);
  return out;
}

// ---------------------------------------------------------------- movement

// scratch for displaced cells (reused, so moving bodies allocate nothing per tick)
const dTail: number[] = [];
const dEl: number[] = [];
const dLife: number[] = [];
const dAux: number[] = [];
const dVx: number[] = [];
const dVy: number[] = [];
const dOwner: number[] = [];
const dObj: number[] = [];
const dPlane: number[] = [];

/** canShift result: the move is clear. */
const CLEAR = 0;
/** canShift result: terrain or the canvas edge is in the way. (Any positive value is the id of a body in the way.) */
const WALL = -1;

/** Can every cell of the body move by (dx, dy)? CLEAR, WALL, or the id of another moving body in the way. */
function canShift(world: World, s: State, b: Body, dx: number, dy: number): number {
  const { w, h, el } = world;
  const o = dx + dy * w;
  for (const i of b.cells) {
    const x = i % w;
    const y = (i / w) | 0;
    if (x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) return WALL;
    const t = i + o;
    const m = s.mark[t];
    if (m === b.id) continue;
    const e = el[t];
    if (REPLACEABLE[e]) continue;
    const k = KIND[e];
    if (k === K_LIQUID || k === K_GAS || k === K_PROJECTILE) continue;
    return m !== 0 && s.byId.has(m) ? m : WALL;
  }
  return CLEAR;
}

/**
 * Two moving bodies bumped along one axis: exchange momentum (masses are cell counts) with a
 * little restitution, so a rebounding chunk shoves the one behind it instead of jamming.
 */
function collide(a: Body, b: Body, axis: 'x' | 'y'): void {
  const ka = axis === 'x' ? 'vx' : 'vy';
  const ma = a.cells.length;
  const mb = b.cells.length;
  const va = a[ka];
  const vb = b[ka];
  const e = Math.min(a.bounce, b.bounce);
  const p = ma * va + mb * vb;
  a[ka] = (p - mb * e * (va - vb)) / (ma + mb);
  b[ka] = (p + ma * e * (va - vb)) / (ma + mb);
}
/**
 * Move the body one cell by (dx, dy). Along each line of the body in the move direction, the
 * cell in front is displaced to the line's tail, so nothing is destroyed.
 */
function shift(world: World, s: State, b: Body, dx: number, dy: number): void {
  const { w, el, life, aux, vx, vy, owner, obj, plane } = world;
  const { mark } = s;
  const o = dx + dy * w;
  const cells = b.cells;
  dTail.length = dEl.length = dLife.length = dAux.length = dVx.length = dVy.length = dOwner.length = dObj.length = dPlane.length = 0;

  // 1. remember what is in front of each line, and where that line's tail is
  for (const i of cells) {
    const t = i + o;
    if (mark[t] === b.id) continue;
    let tail = i;
    for (;;) {
      const prev = tail - o;
      if (dx !== 0 && (tail % w) === (dx > 0 ? 0 : w - 1)) break; // don't wrap rows
      if (prev < 0 || prev >= world.size || mark[prev] !== b.id) break;
      tail = prev;
    }
    dTail.push(tail);
    dEl.push(el[t]);
    dLife.push(life[t]);
    dAux.push(aux[t]);
    dVx.push(vx[t]);
    dVy.push(vy[t]);
    dOwner.push(owner[t]);
    dObj.push(obj[t]);
    dPlane.push(plane[t]);
  }

  // 2. move every body cell, front first
  const n = cells.length;
  for (let k = 0; k < n; k++) {
    const i = o > 0 ? cells[n - 1 - k] : cells[k];
    const j = i + o;
    el[j] = el[i];
    life[j] = life[i];
    aux[j] = aux[i];
    vx[j] = vx[i];
    vy[j] = vy[i];
    owner[j] = owner[i];
    obj[j] = obj[i];
    plane[j] = plane[i];
  }

  // 3. displaced cells land on the tails
  for (let k = 0; k < dTail.length; k++) {
    const t = dTail[k];
    el[t] = dEl[k];
    life[t] = dLife[k];
    aux[t] = dAux[k];
    vx[t] = dVx[k];
    vy[t] = dVy[k];
    owner[t] = dOwner[k];
    obj[t] = dObj[k];
    plane[t] = dPlane[k];
    world.changed(t); // layered pixels: the piece moved off, so what was behind it comes forward
  }

  for (const i of cells) mark[i] = 0;
  for (let k = 0; k < n; k++) {
    cells[k] += o;
    mark[cells[k]] = b.id;
  }
  b.fx += dx;
  b.fy += dy;
}

/** Blocked straight down: slide one cell diagonally down if there is room. */
function slide(world: World, s: State, b: Body): boolean {
  const first = b.vx !== 0 ? Math.sign(b.vx) : world.rng.chance(0.5) ? 1 : -1;
  for (let k = 0; k < 2; k++) {
    const sx = k === 0 ? first : -first;
    if (canShift(world, s, b, sx, 0) === CLEAR && canShift(world, s, b, sx, 1) === CLEAR) {
      shift(world, s, b, sx, 0);
      shift(world, s, b, 0, 1);
      return true;
    }
  }
  return false;
}

/** Nothing below it and no slope to slide down. */
function supported(world: World, s: State, b: Body): boolean {
  if (canShift(world, s, b, 0, 1) === CLEAR) return false;
  for (let sx = -1; sx <= 1; sx += 2) {
    if (canShift(world, s, b, sx, 0) === CLEAR && canShift(world, s, b, sx, 1) === CLEAR) return false;
  }
  return true;
}

function release(s: State, b: Body): void {
  for (const i of b.cells) if (s.mark[i] === b.id) s.mark[i] = 0;
  s.byId.delete(b.id);
}

/**
 * A thrown piece with nowhere to go breaks into rubble: each cell flies as DEBRIS carrying its
 * element, spraying outward from the piece's middle along its velocity, and lands back as itself.
 */
function burst(world: World, s: State, b: Body, speed: number): void {
  const { w, el, aux, life, vx, vy, rng } = world;
  let mx = 0;
  let my = 0;
  for (const i of b.cells) (mx += i % w), (my += (i / w) | 0);
  mx /= b.cells.length;
  my /= b.cells.length;
  const clamp = (v: number) => Math.max(-12, Math.min(12, Math.round(v)));
  for (const i of b.cells) {
    s.mark[i] = 0;
    if (!RIGID[el[i]]) continue; // e.g. burning wood stays put
    const dx = (i % w) - mx;
    const dy = ((i / w) | 0) - my;
    const d = Math.hypot(dx, dy) || 1;
    const spread = speed * 0.5;
    life[i] = aux[i]; // DEBRIS keeps the shade in life and the element in aux
    aux[i] = el[i];
    el[i] = DEBRIS;
    vx[i] = clamp(b.vx + (dx / d) * spread + rng.range(-1, 1));
    vy[i] = clamp(b.vy + (dy / d) * spread + rng.range(-1, 1));
  }
  s.byId.delete(b.id);
  s.dirty = true;
  spawnDust(world, mx, my, Math.min(30, Math.round(b.cells.length / 6)), 4);
  if (world.events.has('impact')) world.events.emit('impact', { x: mx, y: my, strength: b.cells.length * speed });
}

/** A hard landing: dust puffs out along the contact and an 'impact' event goes out. */
function onLand(world: World, s: State, b: Body, v: number): void {
  if (v < rigidTunables.dustSpeed) return;
  const { w, size } = world;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const i of b.cells) {
    if (i + w < size && s.mark[i + w] !== b.id) (sx += i % w), (sy += (i / w) | 0), n++;
  }
  if (n === 0) return;
  const strength = b.cells.length * v;
  spawnDust(world, sx / n, sy / n, Math.min(40, Math.round(4 + Math.sqrt(strength) * 1.5)), Math.max(3, n * 0.6));
  if (world.events.has('impact')) world.events.emit('impact', { x: sx / n, y: sy / n, strength });
}

// ---------------------------------------------------------------- rotation

/**
 * Rotation of integer offsets by 90-degree turns plus three shears (Paeth). Every shear moves
 * whole rows or columns by whole cells, so the mapping is one-to-one: a rotated piece has exactly
 * as many cells as before, with no holes. Positive angles turn clockwise on screen (y is down).
 */
interface RotFactors {
  q: number;
  a: number;
  b: number;
}

function rotFactors(theta: number): RotFactors {
  const quarter = Math.PI / 2;
  const qn = Math.round(theta / quarter);
  const phi = theta - qn * quarter; // within +-45 degrees
  return { q: ((qn % 4) + 4) % 4, a: -Math.tan(phi / 2), b: Math.sin(phi) };
}

/** Rotate offset (x, y); writes the result to rOut. */
const rOut = [0, 0];
function rotate(x: number, y: number, f: RotFactors): void {
  const X = f.q === 0 ? x : f.q === 1 ? -y : f.q === 2 ? -x : y;
  const Y = f.q === 0 ? y : f.q === 1 ? x : f.q === 2 ? -y : -x;
  const x1 = X + Math.round(f.a * Y);
  const y1 = Y + Math.round(f.b * x1);
  rOut[0] = x1 + Math.round(f.a * y1);
  rOut[1] = y1;
}

// scratch for rotations (reused)
const rPos: number[] = [];
const rData: number[] = []; // 8 numbers per body cell: el, life, aux, vx, vy, owner, obj, plane
const rForeign: number[] = []; // 8 numbers per displaced cell
const rVacated: number[] = [];
let stamp = new Int32Array(0);
let stampGen = 0;

/** Fill rPos with where the body's cells would be at angle `theta` and origin (fx, fy); false if off the canvas. */
function place(world: World, b: Body, theta: number, fx: number, fy: number): boolean {
  const f = rotFactors(theta);
  const cx = Math.round(fx);
  const cy = Math.round(fy);
  rPos.length = 0;
  for (let k = 0; k < b.ox.length; k++) {
    rotate(b.ox[k], b.oy[k], f);
    const x = cx + rOut[0];
    const y = cy + rOut[1];
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
    rPos.push(y * world.w + x);
  }
  return true;
}

/** Are all of rPos free for this body (its own cells, empty, or fluid it can push aside)? */
function placeFree(world: World, s: State, b: Body): boolean {
  const { el } = world;
  for (const t of rPos) {
    if (s.mark[t] === b.id) continue;
    const e = el[t];
    if (REPLACEABLE[e]) continue;
    const k = KIND[e];
    if (k === K_LIQUID || k === K_GAS || k === K_PROJECTILE) continue;
    return false;
  }
  return true;
}

/**
 * Move the body onto rPos (same cell count). Fluids that were in the new cells move into the
 * cells the body left, so nothing is destroyed.
 */
function moveOnto(world: World, s: State, b: Body): void {
  const { el, life, aux, vx, vy, owner, obj, plane, size } = world;
  const { mark } = s;
  if (stamp.length < size) stamp = new Int32Array(size);
  const gen = ++stampGen;
  for (const p of rPos) stamp[p] = gen;

  rData.length = rForeign.length = rVacated.length = 0;
  for (const p of b.cells) rData.push(el[p], life[p], aux[p], vx[p], vy[p], owner[p], obj[p], plane[p]);
  for (const p of rPos) if (mark[p] !== b.id) rForeign.push(el[p], life[p], aux[p], vx[p], vy[p], owner[p], obj[p], plane[p]);
  for (const p of b.cells) if (stamp[p] !== gen) rVacated.push(p);

  for (const p of b.cells) mark[p] = 0;
  for (let k = 0; k < rPos.length; k++) {
    const p = rPos[k];
    const d = k * 8;
    el[p] = rData[d];
    life[p] = rData[d + 1];
    aux[p] = rData[d + 2];
    vx[p] = rData[d + 3];
    vy[p] = rData[d + 4];
    owner[p] = rData[d + 5];
    obj[p] = rData[d + 6];
    plane[p] = rData[d + 7];
    mark[p] = b.id;
  }
  for (let k = 0; k < rVacated.length; k++) {
    const p = rVacated[k];
    const d = k * 8;
    el[p] = rForeign[d];
    life[p] = rForeign[d + 1];
    aux[p] = rForeign[d + 2];
    vx[p] = rForeign[d + 3];
    vy[p] = rForeign[d + 4];
    owner[p] = rForeign[d + 5];
    obj[p] = rForeign[d + 6];
    plane[p] = rForeign[d + 7];
    world.changed(p); // layered pixels: what was behind the piece comes forward
  }

  // keep cells sorted (shift() relies on it), with the shape offsets aligned
  const order = rPos.map((_, k) => k).sort((p, q) => rPos[p] - rPos[q]);
  const ox = b.ox;
  const oy = b.oy;
  b.cells = order.map((k) => rPos[k]);
  b.ox = order.map((k) => ox[k]);
  b.oy = order.map((k) => oy[k]);
}

/**
 * Spin and tipping. A piece resting on something whose center of mass hangs past the edge of its
 * support starts to turn over that edge; a piece in the air keeps spinning. Returns true while
 * the piece is tipping (so it is not put to rest).
 */
function rotateBody(world: World, s: State, b: Body): boolean {
  const { w, size, el } = world;
  let mx = 0;
  let contactMin = Infinity;
  let contactMax = -Infinity;
  let contactY = -1;
  for (const i of b.cells) {
    const x = i % w;
    mx += x;
    const below = i + w;
    if (below < size) {
      if (s.mark[below] === b.id) continue;
      const e = el[below];
      const k = KIND[e];
      if (REPLACEABLE[e] || k === K_LIQUID || k === K_GAS || k === K_PROJECTILE) continue;
    }
    contactMin = Math.min(contactMin, x);
    contactMax = Math.max(contactMax, x);
    contactY = Math.max(contactY, (i / w) | 0);
  }
  mx = mx / b.cells.length + 0.5; // center of mass, measured from cell edges

  // turning point: the support edge it tips over, or its own middle when airborne
  let px = b.fx;
  let py = b.fy;
  let tipping = false;
  if (contactY >= 0) {
    if (mx > contactMax + 1.5) {
      tipping = true;
      b.omega = Math.min(rigidTunables.maxSpin, b.omega + rigidTunables.tip);
      px = contactMax + 1;
      py = contactY + 1;
    } else if (mx < contactMin - 0.5) {
      tipping = true;
      b.omega = Math.max(-rigidTunables.maxSpin, b.omega - rigidTunables.tip);
      px = contactMin;
      py = contactY + 1;
    } else {
      b.omega *= rigidTunables.spinFriction; // sitting squarely on it: stop turning
    }
  }
  if (Math.abs(b.omega) < 0.002) {
    b.omega = 0;
    return tipping;
  }

  // rigid turn about (px, py): the origin swings around it and the shape turns with it
  const c = Math.cos(b.omega);
  const sn = Math.sin(b.omega);
  const dx = b.fx - px;
  const dy = b.fy - py;
  const nfx = px + dx * c - dy * sn;
  const nfy = py + dx * sn + dy * c;
  const theta = b.theta + b.omega;
  for (let lift = 0; lift >= -1; lift--) {
    // rounding can clip the support by a cell; allow a one-cell lift
    if (place(world, b, theta, nfx, nfy + lift) && placeFree(world, s, b)) {
      moveOnto(world, s, b);
      b.theta = theta;
      b.fx = nfx;
      b.fy = nfy + lift;
      b.stuck = 0;
      return tipping;
    }
  }
  b.omega *= -0.2; // blocked
  b.stuck++;
  return tipping;
}

/** Returns false when the body has come to rest (or vanished) and should be dropped. */
function moveBody(world: World, s: State, b: Body): boolean {
  // drop cells that were cut, burnt or otherwise stopped being solid
  let live = 0;
  for (let k = 0; k < b.cells.length; k++) {
    const i = b.cells[k];
    if (s.mark[i] === b.id && solidAt(world, i)) {
      b.cells[live] = i;
      b.ox[live] = b.ox[k];
      b.oy[live] = b.oy[k];
      live++;
    } else if (s.mark[i] === b.id) s.mark[i] = 0;
  }
  b.cells.length = b.ox.length = b.oy.length = live;
  if (live === 0) {
    release(s, b);
    return false;
  }

  const maxFall = Math.max(1, world.params.gravity);
  if (b.vy < maxFall) b.vy = Math.min(b.vy + rigidTunables.gravity, maxFall); // thrown faster than that? keep it
  b.ax += b.vx;
  b.ay += b.vy;

  const speed = Math.hypot(b.vx, b.vy);
  let shifts = 0;
  let crumble = false;
  for (let guard = 0; guard < 64 && (Math.abs(b.ax) >= 1 || Math.abs(b.ay) >= 1); guard++) {
    if (Math.abs(b.ay) >= Math.abs(b.ax)) {
      const sy = Math.sign(b.ay);
      const r = canShift(world, s, b, 0, sy);
      if (r === CLEAR) {
        shift(world, s, b, 0, sy);
        b.ay -= sy;
        shifts++;
        continue;
      }
      b.ay = 0;
      if (r !== WALL && sy < 0) collide(b, s.byId.get(r)!, 'y');
      else if (sy > 0 && r === WALL && slide(world, s, b)) b.ay = Math.max(0, b.vy - 1); // slid down a slope
      else if (sy > 0 && r === WALL && (onLand(world, s, b, b.vy), b.cells.length <= rigidTunables.crumbleSize && b.vy > 0.8)) {
        crumble = true; // small pieces break up on landing
        break;
      } else if (sy > 0 && r === WALL && b.vy > rigidTunables.impact) {
        b.vy = -b.vy * b.bounce; // hit the ground hard: rebound (blasted rock flies back out)
        b.vx *= rigidTunables.friction;
      } else if (sy > 0) {
        // landed on terrain, or is resting on another piece (pieces stack, they don't trade fall speed)
        b.vy = 0;
        b.vx *= rigidTunables.friction; // landed: skid and slow down
      } else b.vy = -b.vy * b.bounce; // hit something overhead
    } else {
      const sx = Math.sign(b.ax);
      const r = canShift(world, s, b, sx, 0);
      if (r === CLEAR) {
        shift(world, s, b, sx, 0);
        b.ax -= sx;
        shifts++;
        continue;
      }
      b.ax = 0;
      if (r !== WALL) collide(b, s.byId.get(r)!, 'x');
      else b.vx = -b.vx * b.bounce;
    }
  }

  if (crumble) {
    b.vx = world.rng.range(-1, 1);
    b.vy = -1.5; // a little hop so the bits scatter
    burst(world, s, b, 3);
    return false;
  }

  if (b.shatter && b.age++ < 2 && shifts === 0 && speed > 1.5) {
    burst(world, s, b, speed);
    return false;
  }

  if (shifts > 0) b.stuck = 0;
  const tipping = rotateBody(world, s, b) && b.stuck < 8; // wedged tight: give up and settle
  // Wedged: each blocked turn leaves a little spin (tip adds, the bounce flips it), so it would
  // never reach exactly 0 and the piece would hang in the air as a body forever. Stop it.
  if (b.stuck >= 8) b.omega = 0;

  if (!tipping && b.omega === 0 && Math.abs(b.vx) < 0.3 && b.vy <= rigidTunables.gravity && supported(world, s, b)) {
    // resting on a piece that may still move away: re-check support soon so it can't end up floating
    if (canShift(world, s, b, 0, 1) !== WALL) s.dirty = true;
    release(s, b);
    return false;
  }
  return true;
}
registerPass({
  name: 'rigidBodies',
  phase: 'pre',
  order: 10,
  run: (world) => {
    if (!flagOn('rigidBodies')) return;
    const s = world.promotions > 0 ? state(world) : states.get(world);
    if (!s) return;
    if (s.promotions !== world.promotions) {
      // a layer that came forward (e.g. a far mountain behind a piece that fell) may be hanging in the air
      s.promotions = world.promotions;
      s.dirty = true;
    }
    if (s.dirty && world.tick - s.lastCheck >= rigidTunables.checkEvery) {
      s.lastCheck = world.tick;
      detect(world, s);
    }
    if (s.bodies.length === 0) return;
    // lowest bodies first, so a stack falls together instead of the top one waiting
    s.bodies.sort((a, b) => b.cells[b.cells.length - 1] - a.cells[a.cells.length - 1] || a.id - b.id);
    let keep = 0;
    for (const b of s.bodies) if (moveBody(world, s, b)) s.bodies[keep++] = b;
    s.bodies.length = keep;
  },
});
