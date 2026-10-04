import type { ArtView } from './blueprint';
import { FAR_PLANE, NO_PLANE } from './constants';
import { El, rgba } from './elements';

/** Same base color as the paper layer (without its grain). */
export const PAPER_RGBA = rgba(238, 230, 212);

/** Straight-alpha "over" on packed little-endian RGBA (see rgba()). */
export function over(top: number, under: number): number {
  const ta = top >>> 24;
  if (ta === 255) return top >>> 0;
  if (ta === 0) return under >>> 0;
  const ua = under >>> 24;
  const ub = (ua * (255 - ta)) / 255; // under's weight
  const oa = ta + ub;
  if (oa <= 0) return 0;
  const ch = (s: number) => Math.round((((top >>> s) & 255) * ta + ((under >>> s) & 255) * ub) / oa);
  return (ch(0) | (ch(8) << 8) | (ch(16) << 16) | (Math.round(oa) << 24)) >>> 0;
}

/** The art composited once as generated (nothing broken yet), so untouched cells only copy pixels. */
export interface PreparedArt {
  k: number;
  view: ArtView;
  initial: Uint32Array;
}

const prepared = new WeakMap<ArtView['art'], PreparedArt>();

/**
 * Composite one art pixel back to front: paper (under solid cells), the background plane, then the
 * planes. A plane counts as real if it is `from` or behind it (unless `spillOnly`); a plane nearer
 * than that only contributes its soft edges, where it never had a cell of its own.
 */
function pixel(view: ArtView, p: number, paper: boolean, from: number, spillOnly: boolean, cell: number): number {
  const { art, planes } = view;
  let acc = over(art.bg[p], paper ? PAPER_RGBA : 0);
  for (let q = art.planes.length - 1; q >= 0; q--) {
    const real = !spillOnly && q >= from;
    if (!real && planes[q].el[cell] !== El.EMPTY) continue;
    acc = over(art.planes[q][p], acc);
  }
  return acc;
}

/** Precompute (once per art, cached) the as-generated picture. */
export function prepareArt(view: ArtView): PreparedArt {
  let prep = prepared.get(view.art);
  if (prep) return prep;
  const { art, w, h } = view;
  const k = art.k;
  const aw = w * k;
  const initial = new Uint32Array(aw * h * k);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const cell = cy * w + cx;
      const solid = view.el[cell] !== El.EMPTY;
      const from = solid ? (view.plane[cell] === NO_PLANE ? 0 : view.plane[cell]) : 0;
      for (let yy = 0; yy < k; yy++) {
        let p = (cy * k + yy) * aw + cx * k;
        for (let xx = 0; xx < k; xx++, p++) initial[p] = pixel(view, p, solid, from, false, cell);
      }
    }
  }
  prep = { k, view, initial };
  prepared.set(art, prep);
  return prep;
}

/**
 * Build the art image (w*k x h*k) for this frame. Every art pixel belongs to a cell. Per cell, left
 * of frontierX:
 * - untouched (the world cell is what the generator put there): the precomputed picture
 * - world cell is some other static material of the blueprint (a layer that moved forward after the
 *   one in front broke): that layer's art, with the layers behind it, over paper
 * - world cell EMPTY (everything in front of the background is gone): just the background
 * - anything else (water, fire, ash... drawn by the cells layer): transparent
 *
 * Only the cells in [x0, x1) x [y0, y1) are written (default: all of them).
 */
export function compose(
  out: Uint32Array,
  worldEl: Uint8Array,
  worldPlane: Uint8Array,
  prep: PreparedArt,
  frontierX: number,
  x0 = 0,
  y0 = 0,
  x1 = prep.view.w,
  y1 = prep.view.h,
): void {
  const { k, view, initial } = prep;
  const { w } = view;
  const aw = w * k;
  const fx = Math.max(0, Math.min(w, frontierX));
  for (let cy = y0; cy < y1; cy++) {
    for (let cx = x0; cx < x1; cx++) {
      const i = cy * w + cx;
      const base = cy * k * aw + cx * k;
      const we = worldEl[i];
      if (cx >= fx) {
        fill(out, base, aw, k, 0);
      } else if (we === view.el[i] && worldPlane[i] === view.plane[i]) {
        for (let yy = 0; yy < k; yy++) {
          const row = base + yy * aw;
          for (let xx = 0; xx < k; xx++) out[row + xx] = initial[row + xx];
        }
      } else if (we === El.EMPTY) {
        // broken through everything: the background, plus soft edges of planes that never had a cell here
        for (let yy = 0; yy < k; yy++) {
          const row = base + yy * aw;
          for (let xx = 0; xx < k; xx++) out[row + xx] = pixel(view, row + xx, false, 0, true, i);
        }
      } else {
        const q = worldPlane[i];
        if (q === FAR_PLANE && we === El.ROCK) {
          // an interactive far ridge: the background art, on paper, behind whatever planes never had a cell here
          for (let yy = 0; yy < k; yy++) {
            const row = base + yy * aw;
            for (let xx = 0; xx < k; xx++) out[row + xx] = pixel(view, row + xx, true, view.art.planes.length, false, i);
          }
        } else if (q === NO_PLANE || view.planes[q]?.el[i] !== we) {
          fill(out, base, aw, k, 0); // a dynamic or painted cell: its own color shows
        } else {
          for (let yy = 0; yy < k; yy++) {
            const row = base + yy * aw;
            for (let xx = 0; xx < k; xx++) out[row + xx] = pixel(view, row + xx, true, q, false, i);
          }
        }
      }
    }
  }
}

function fill(out: Uint32Array, base: number, aw: number, k: number, v: number): void {
  for (let yy = 0; yy < k; yy++) {
    const row = base + yy * aw;
    for (let xx = 0; xx < k; xx++) out[row + xx] = v;
  }
}
