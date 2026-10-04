import { compose, prepareArt } from './artCompose';
import type { ArtView } from './blueprint';
import { Flag } from './constants';
import { shadeCells, type ShadeRegion } from './shadeCells';
import { shaders } from './shaders';
import type { World } from './world';

/** Tile side, in cells. */
export const TILE = 16;
/** A changed cell can change the look of cells this far away (the shaders read a 5x5 neighbourhood). */
const REACH = 2;
/** Flag bits that never change the look. */
const FLAG_MASK = 0xff & ~Flag.UPDATED & ~Flag.QUEUED;
const FLAG_MASK32 = (FLAG_MASK * 0x01010101) >>> 0;

/** A rectangle of art pixels that changed this frame. */
export interface ArtRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The art-resolution frame (the ink layer's buffer), kept from frame to frame and redrawn only where
 * it can have changed. Each frame it compares the cells with a copy of last frame's (element, plane,
 * aux, life, owner, flags), and redraws the 16x16-cell tiles around the cells that differ, the
 * columns the frontier crossed, and the tiles holding something that animates by itself (water,
 * fire, smoke...). The result is identical to composing and shading the whole frame.
 *
 * No hooks into the World: anything that writes the cell arrays is seen, however it writes them.
 */
export class ArtFrame {
  /** Tiles to redraw this frame (1 = redraw). */
  private dirty = new Uint8Array(0);
  /** Tiles that drew an animated shader last time they were drawn. */
  private animated = new Uint8Array(0);
  private cols = 0;
  private rows = 0;
  private prev: { el: Uint8Array; plane: Uint8Array; aux: Uint8Array; life: Uint8Array; owner: Uint16Array; flags: Uint8Array } | null =
    null;
  private key: unknown[] = [];
  private frontier = 0;
  private readonly rects: ArtRect[] = [];
  /** Rectangles written by the last update(). */
  rectCount = 0;
  /** Tiles redrawn by the last update(). */
  tilesDrawn = 0;

  /**
   * Bring `out` (w*k x h*k art pixels) up to date with the world. Returns the changed rectangles:
   * the first `rectCount` entries (the array is reused, so read them before the next call).
   */
  update(out: Uint32Array, world: World, art: ArtView | undefined, frontierX: number, k: number, shaded: boolean): readonly ArtRect[] {
    const { w, h } = world;
    const key = [out, world, art?.art, k, shaded, shaders.version];
    const fresh = !this.prev || key.length !== this.key.length || key.some((v, i) => v !== this.key[i]);
    const fx = Math.max(0, Math.min(w, Math.ceil(frontierX)));
    if (fresh) {
      this.key = key;
      this.cols = Math.ceil(w / TILE);
      this.rows = Math.ceil(h / TILE);
      this.dirty = new Uint8Array(this.cols * this.rows).fill(1);
      this.animated = new Uint8Array(this.cols * this.rows);
      this.prev = {
        el: world.el.slice(),
        plane: world.plane.slice(),
        aux: world.aux.slice(),
        life: world.life.slice(),
        owner: world.owner.slice(),
        flags: world.flags.slice(),
      };
    } else {
      this.dirty.set(this.animated);
      this.diff(world);
      if (fx !== this.frontier) this.markColumns(Math.min(fx, this.frontier) - REACH, Math.max(fx, this.frontier) + REACH);
    }
    this.frontier = fx;

    const { dirty, cols } = this;
    const aw = w * k;
    let drawn = 0;
    for (let t = 0; t < dirty.length; t++) {
      if (!dirty[t]) continue;
      drawn++;
      this.animated[t] = 0;
      const x0 = (t % cols) * TILE;
      const y0 = ((t / cols) | 0) * TILE;
      const x1 = Math.min(w, x0 + TILE);
      const y1 = Math.min(h, y0 + TILE);
      if (art) compose(out, world.el, world.plane, prepareArt(art), fx, x0, y0, x1, y1);
      else for (let y = y0 * k; y < y1 * k; y++) out.fill(0, y * aw + x0 * k, y * aw + x1 * k);
    }
    this.tilesDrawn = drawn;
    if (shaded && drawn) {
      const region: ShadeRegion = { tiles: dirty, cols, size: TILE, animated: this.animated };
      shadeCells(out, world, k, art, fx, region);
    }
    this.collectRects(w, h, k);
    return this.rects;
  }

  /** Mark the tiles around every cell that differs from last frame, and remember the new values. */
  private diff(world: World): void {
    const p = this.prev!;
    this.diffBytes(world.el, p.el, 0xff, world.w);
    this.diffBytes(world.plane, p.plane, 0xff, world.w);
    this.diffBytes(world.aux, p.aux, 0xff, world.w);
    this.diffBytes(world.life, p.life, 0xff, world.w);
    this.diffBytes(world.flags, p.flags, FLAG_MASK, world.w);
    this.diffOwner(world.owner, p.owner, world.w);
  }

  /** The owner ids (16 bits), 2 cells per word. */
  private diffOwner(cur: Uint16Array, old: Uint16Array, w: number): void {
    const n = cur.length;
    const words = cur.byteOffset % 4 === 0 && old.byteOffset % 4 === 0 ? n >> 1 : 0;
    if (words) {
      const c32 = new Uint32Array(cur.buffer, cur.byteOffset, words);
      const o32 = new Uint32Array(old.buffer, old.byteOffset, words);
      for (let q = 0; q < words; q++) {
        if (c32[q] === o32[q]) continue;
        for (let i = q * 2; i < q * 2 + 2; i++) if (cur[i] !== old[i]) this.markCell(i % w, (i / w) | 0);
        o32[q] = c32[q];
      }
    }
    for (let i = words * 2; i < n; i++) {
      if (cur[i] !== old[i]) this.markCell(i % w, (i / w) | 0);
      old[i] = cur[i];
    }
  }

  /** Compare 4 cells at a time; on a difference, find the cells and mark them. */
  private diffBytes(cur: Uint8Array, old: Uint8Array, mask: number, w: number): void {
    const n = cur.length;
    const words = cur.byteOffset % 4 === 0 && old.byteOffset % 4 === 0 ? n >> 2 : 0;
    const m32 = mask === 0xff ? 0xffffffff : FLAG_MASK32;
    if (words) {
      const c32 = new Uint32Array(cur.buffer, cur.byteOffset, words);
      const o32 = new Uint32Array(old.buffer, old.byteOffset, words);
      for (let q = 0; q < words; q++) {
        if (((c32[q] ^ o32[q]) & m32) === 0) continue;
        for (let i = q * 4; i < q * 4 + 4; i++) if ((cur[i] ^ old[i]) & mask) this.markCell(i % w, (i / w) | 0);
        o32[q] = c32[q];
      }
    }
    for (let i = words * 4; i < n; i++) {
      if ((cur[i] ^ old[i]) & mask) this.markCell(i % w, (i / w) | 0);
      old[i] = cur[i];
    }
  }

  /** Mark every tile within REACH cells of (x, y). */
  private markCell(x: number, y: number): void {
    const ta = Math.max(0, ((x - REACH) / TILE) | 0);
    const tb = Math.min(this.cols - 1, ((x + REACH) / TILE) | 0);
    const ra = Math.max(0, ((y - REACH) / TILE) | 0);
    const rb = Math.min(this.rows - 1, ((y + REACH) / TILE) | 0);
    for (let r = ra; r <= rb; r++) for (let t = ta; t <= tb; t++) this.dirty[r * this.cols + t] = 1;
  }

  /** Mark whole tile columns covering cells [x0, x1]. */
  private markColumns(x0: number, x1: number): void {
    const ta = Math.max(0, Math.floor(x0 / TILE));
    const tb = Math.min(this.cols - 1, Math.floor(x1 / TILE));
    for (let r = 0; r < this.rows; r++) for (let t = ta; t <= tb; t++) this.dirty[r * this.cols + t] = 1;
  }

  /**
   * Merge each row's runs of redrawn tiles into rectangles of art pixels, and a run into the
   * rectangle above it when they span the same columns (fewer, larger uploads).
   */
  private collectRects(w: number, h: number, k: number): void {
    const { dirty, cols, rows, rects } = this;
    let n = 0;
    for (let r = 0; r < rows; r++) {
      let t = 0;
      while (t < cols) {
        if (!dirty[r * cols + t]) {
          t++;
          continue;
        }
        const t0 = t;
        while (t < cols && dirty[r * cols + t]) t++;
        const x = t0 * TILE * k;
        const y = r * TILE * k;
        const rw = Math.min(w * k, t * TILE * k) - x;
        const rh = Math.min(h * k, (r + 1) * TILE * k) - y;
        let merged = false;
        for (let q = 0; q < n; q++) {
          const above = rects[q];
          if (above.x === x && above.w === rw && above.y + above.h === y) {
            above.h += rh;
            merged = true;
            break;
          }
        }
        if (merged) continue;
        const rect = rects[n] ?? (rects[n] = { x: 0, y: 0, w: 0, h: 0 });
        rect.x = x;
        rect.y = y;
        rect.w = rw;
        rect.h = rh;
        n++;
      }
    }
    this.rectCount = n;
    dirty.fill(0);
  }
}
