import { BEHIND_LAYERS, Flag, NO_PLANE, type LevelDims } from './constants';
import { El, hash3, IS_STATIC } from './elements';
import { EventBus } from './events';
import { Hasher } from './hash';
import type { WorldObject } from './objects';
import { defaultParams, type GenParams } from './params';
import { Rng } from './rng';

export interface SetOpts {
  life?: number;
  aux?: number;
  vx?: number;
  vy?: number;
  owner?: number;
  /** Object id (see core/objects.ts). Cleared unless given. */
  obj?: number;
  /** Mark the cell CUT (slash scar) and emit 'cut' if it held something. */
  cut?: boolean;
}

export interface WaterSource {
  x: number;
  y: number;
  /** Cells per tick (fractional rates are up to the emitter). */
  rate: number;
}

/**
 * The painting as a cell grid. Structure-of-arrays: one typed array per field, indexed by
 * idx(x, y) = y * w + x, with y = 0 at the TOP. This is the single source of truth for physics,
 * scanning and replay.
 */
export class World {
  readonly w: number;
  readonly h: number;
  readonly size: number;
  tick = 0;
  /** ALL randomness in the sim goes through this. */
  rng: Rng;
  /** Gravity etc., readable by behaviors. */
  params: GenParams;
  readonly events = new EventBus();

  readonly el: Uint8Array; // element id per cell
  readonly life: Uint8Array; // countdown (fire lifetime, etc.)
  readonly aux: Uint8Array; // element-specific (ink wetness, water pressure, shade variation)
  readonly vx: Int8Array; // velocity, cells/tick (SPLAT, push)
  readonly vy: Int8Array;
  readonly owner: Uint16Array; // stroke id (0 = none). Links cell -> Blueprint registry entry
  readonly obj: Uint16Array; // object id (0 = none), see core/objects.ts. Moves with the cell's material
  readonly flags: Uint8Array; // see Flag in constants.ts

  /**
   * Which blueprint plane the front cell came from (NO_PLANE for anything painted or spawned).
   * Rendering uses it to pick the art that belongs to the cell.
   */
  readonly plane: Uint8Array;

  /**
   * Layered pixels: material stacked BEHIND the front cell, nearest first, compact (no gaps).
   * When a front cell's static material is destroyed, the next one moves forward (applyPending).
   * Only positions flagged HAS_BEHIND have anything here. Static between promotions.
   */
  readonly behindEl: Uint8Array[] = [];
  readonly behindOwner: Uint16Array[] = [];
  readonly behindPlane: Uint8Array[] = [];
  private readonly pending: Int32Array;
  private pendingCount = 0;

  /** Active water sources. The frontier reveal adds them; B's emitter pass reads them. */
  sources: WaterSource[] = [];

  /** Tracked objects by id (see core/objects.ts). The frontier reveal adds them. */
  objects = new Map<number, WorldObject>();

  constructor(dims: LevelDims, seed: number, params: GenParams = defaultParams()) {
    this.w = dims.w;
    this.h = dims.h;
    this.size = dims.w * dims.h;
    this.rng = new Rng(seed);
    this.params = { ...params };
    this.el = new Uint8Array(this.size);
    this.life = new Uint8Array(this.size);
    this.aux = new Uint8Array(this.size);
    this.vx = new Int8Array(this.size);
    this.vy = new Int8Array(this.size);
    this.owner = new Uint16Array(this.size);
    this.obj = new Uint16Array(this.size);
    this.flags = new Uint8Array(this.size);
    this.plane = new Uint8Array(this.size).fill(NO_PLANE);
    for (let d = 0; d < BEHIND_LAYERS; d++) {
      this.behindEl.push(new Uint8Array(this.size));
      this.behindOwner.push(new Uint16Array(this.size));
      this.behindPlane.push(new Uint8Array(this.size).fill(NO_PLANE));
    }
    this.pending = new Int32Array(this.size);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Out-of-bounds reads as ROCK, so the edges behave like solid walls. */
  get(x: number, y: number): number {
    return this.inBounds(x, y) ? this.el[y * this.w + x] : El.ROCK;
  }

  isEmpty(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.el[y * this.w + x] === El.EMPTY;
  }

  /**
   * Write a cell. Clears life, velocity, owner and obj unless given in opts; keeps aux (shade) unless
   * given; keeps flags. Out-of-bounds writes are ignored.
   */
  set(x: number, y: number, el: number, opts?: SetOpts): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.w + x;
    const prev = this.el[i];
    if (opts?.cut) {
      this.flags[i] |= Flag.CUT;
      if (prev !== El.EMPTY && this.events.has('cut')) {
        this.events.emit('cut', { x, y, el: prev, owner: this.owner[i] });
      }
    }
    this.el[i] = el;
    if (this.flags[i] & Flag.HAS_BEHIND) this.noteChange(i, el);
    this.plane[i] = NO_PLANE; // painted or spawned cells belong to no blueprint plane
    this.life[i] = opts?.life ?? 0;
    this.vx[i] = opts?.vx ?? 0;
    this.vy[i] = opts?.vy ?? 0;
    this.owner[i] = opts?.owner ?? 0;
    this.obj[i] = opts?.obj ?? 0;
    if (opts?.aux !== undefined) this.aux[i] = opts.aux;
  }

  /**
   * Swap the contents of two cells. CUT/GENERATED flags stay with the position; both cells are
   * marked UPDATED so they do not move again this tick.
   */
  swap(x1: number, y1: number, x2: number, y2: number): void {
    const a = y1 * this.w + x1;
    const b = y2 * this.w + x2;
    swapIn(this.el, a, b);
    swapIn(this.life, a, b);
    swapIn(this.aux, a, b);
    swapIn(this.vx, a, b);
    swapIn(this.vy, a, b);
    swapIn(this.owner, a, b);
    swapIn(this.plane, a, b);
    if (this.flags[a] & Flag.HAS_BEHIND) this.noteChange(a, this.el[a]);
    if (this.flags[b] & Flag.HAS_BEHIND) this.noteChange(b, this.el[b]);
    swapIn(this.obj, a, b);
    this.flags[a] |= Flag.UPDATED;
    this.flags[b] |= Flag.UPDATED;
  }

  /** A position with material behind it just got `el` in front: queue a promotion unless it is still solid or burning. */
  private noteChange(i: number, el: number): void {
    if (IS_STATIC[el] || el === El.FIRE || this.flags[i] & Flag.QUEUED) return;
    this.flags[i] |= Flag.QUEUED;
    this.pending[this.pendingCount++] = i;
  }

  /**
   * Layered pixels: for every position whose front material was destroyed this tick, move the next
   * layer forward and shift the stack (any ash, smoke or other residue left in front is dropped).
   * Called once at the end of every step, in the order the changes happened, so replays match.
   */
  applyPending(): void {
    const { el, owner, aux, life, vx, vy, plane, flags, w } = this;
    for (let n = 0; n < this.pendingCount; n++) {
      const i = this.pending[n];
      flags[i] &= ~Flag.QUEUED;
      const front = el[i];
      if (front !== El.EMPTY && (IS_STATIC[front] || front === El.FIRE)) continue; // solid again, or still burning
      const next = this.behindEl[0][i];
      el[i] = next;
      owner[i] = this.behindOwner[0][i];
      this.obj[i] = owner[i]; // generated material: its object is its stroke
      plane[i] = next === El.EMPTY ? NO_PLANE : this.behindPlane[0][i];
      life[i] = 0;
      vx[i] = 0;
      vy[i] = 0;
      if (next !== El.EMPTY) aux[i] = hash3(i % w, (i / w) | 0, 0);
      for (let d = 0; d < BEHIND_LAYERS - 1; d++) {
        this.behindEl[d][i] = this.behindEl[d + 1][i];
        this.behindOwner[d][i] = this.behindOwner[d + 1][i];
        this.behindPlane[d][i] = this.behindPlane[d + 1][i];
      }
      const last = BEHIND_LAYERS - 1;
      this.behindEl[last][i] = El.EMPTY;
      this.behindOwner[last][i] = 0;
      this.behindPlane[last][i] = NO_PLANE;
      if (this.behindEl[0][i] === El.EMPTY) flags[i] &= ~Flag.HAS_BEHIND;
    }
    this.pendingCount = 0;
  }

  /** Inclusive rectangle, clipped to the grid. */
  clearRect(x0: number, y0: number, x1: number, y1: number, opts?: SetOpts): void {
    const xa = Math.max(0, Math.floor(Math.min(x0, x1)));
    const xb = Math.min(this.w - 1, Math.floor(Math.max(x0, x1)));
    const ya = Math.max(0, Math.floor(Math.min(y0, y1)));
    const yb = Math.min(this.h - 1, Math.floor(Math.max(y0, y1)));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) this.set(x, y, El.EMPTY, opts);
  }

  /** Visit every in-bounds cell within radius r of (cx, cy). */
  forCircle(cx: number, cy: number, r: number, fn: (x: number, y: number) => void): void {
    const r2 = r * r;
    const xa = Math.max(0, Math.floor(cx - r));
    const xb = Math.min(this.w - 1, Math.ceil(cx + r));
    const ya = Math.max(0, Math.floor(cy - r));
    const yb = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) fn(x, y);
      }
    }
  }

  clearCircle(cx: number, cy: number, r: number, opts?: SetOpts): void {
    this.forCircle(cx, cy, r, (x, y) => this.set(x, y, El.EMPTY, opts));
  }

  /** Count cells per element id. */
  countByElement(out = new Uint32Array(256)): Uint32Array {
    out.fill(0);
    for (let i = 0; i < this.size; i++) out[this.el[i]]++;
    return out;
  }

  /** Deterministic hash of all cell state, the tick, the RNG state and object stats. UPDATED bits are ignored. */
  hash(): number {
    const h = new Hasher();
    for (const o of this.objects.values()) {
      h.int(o.id);
      for (const [k, v] of Object.entries(o.stats)) h.int(k.length).int(k.charCodeAt(0)).int(Math.round(v * 1000));
    }
    h
      .int(this.w)
      .int(this.h)
      .int(this.tick)
      .int(this.rng.state)
      .int(this.sources.length)
      .bytes(this.el)
      .bytes(this.life)
      .bytes(this.aux)
      .bytes(this.vx)
      .bytes(this.vy)
      .u16(this.owner)
      .u16(this.obj)
      .bytes(this.plane)
      .bytes(this.flags, 0xff & ~Flag.UPDATED & ~Flag.QUEUED);
    for (let d = 0; d < BEHIND_LAYERS; d++) h.bytes(this.behindEl[d]).u16(this.behindOwner[d]).bytes(this.behindPlane[d]);
    return h.digest();
  }
}

function swapIn(a: Uint8Array | Int8Array | Uint16Array, i: number, j: number): void {
  const t = a[i];
  a[i] = a[j];
  a[j] = t;
}
