import type { Blueprint, PlaneGrid } from '../core/blueprint';
import { El, ELEMENTS, elements, rgba } from '../core/elements';
import { artOf } from './artState';
import type { MountainRec } from './mountainStore';

/**
 * Shared helpers for gen/setpieces/: finding the land, keeping spans free of scenery, carving
 * hollows into mountains and looking up sim elements by name (gen may not import the sim).
 * Setpieces run before generate() flattens the planes, so everything here reads the plane grids.
 */

/** Element id registered under `name` (e.g. 'person', 'bird'), or 0 if nobody registered it. */
export function elementId(name: string): number {
  return elements.all().find((e) => e.name === name)?.id ?? 0;
}

/** Hangs in the sky (a cloud, the moon): not ground, not in the way of what stands below. */
const inSky = (e: number) => ELEMENTS[e]?.anchored === true && !ELEMENTS[e]?.solidForScan;

/** Topmost cell of one plane in column x that is not sky (bp.h if none). */
export function topIn(bp: Blueprint, grid: PlaneGrid, x: number): number {
  const cx = Math.max(0, Math.min(bp.w - 1, Math.round(x)));
  for (let y = 0; y < bp.h; y++) {
    const e = grid.el[y * bp.w + cx];
    if (e !== El.EMPTY && !inSky(e)) return y;
  }
  return bp.h;
}

/** Topmost cell any plane has material in, in column x (bp.h if none): what will be the surface. */
export function topAt(bp: Blueprint, x: number): number {
  let top = bp.h;
  for (const g of bp.planes ?? []) top = Math.min(top, topIn(bp, g, x));
  return top;
}

/** Owner of the topmost material in column x, and the plane it is in (-1 if the column is empty). */
export function topOwner(bp: Blueprint, x: number): { owner: number; plane: number; y: number } {
  const y = topAt(bp, x);
  if (y >= bp.h) return { owner: 0, plane: -1, y };
  const i = y * bp.w + Math.round(x);
  const planes = bp.planes ?? [];
  for (let q = 0; q < planes.length; q++) if (planes[q].el[i] !== El.EMPTY && !inSky(planes[q].el[i])) return { owner: planes[q].owner[i], plane: q, y };
  return { owner: 0, plane: -1, y };
}

// ---------------------------------------------------------------- spans kept free of scenery

const reserved = new WeakMap<Blueprint, [number, number][]>();

/** Keep cells x0..x1 (inclusive) free of trees and plateau scenes, e.g. a village. Run before them. */
export function reserveSpan(bp: Blueprint, x0: number, x1: number): void {
  let list = reserved.get(bp);
  if (!list) reserved.set(bp, (list = []));
  list.push([Math.min(x0, x1), Math.max(x0, x1)]);
}

export function isReserved(bp: Blueprint, x: number): boolean {
  return reserved.get(bp)?.some(([a, b]) => x >= a && x <= b) ?? false;
}

// ---------------------------------------------------------------- hollows inside mountains

export interface Pocket {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

const pockets = new WeakMap<Blueprint, Pocket[]>();

/** Is (x, y) inside the ellipse? */
const inside = (p: Pocket, x: number, y: number) => ((x - p.cx) / p.rx) ** 2 + ((y - p.cy) / p.ry) ** 2 <= 1;

/**
 * A spot for a sealed hollow of radii (rx, ry) inside mountain `m`: every cell of the hollow plus
 * `wall` cells around it is that mountain's ROCK, nothing nearer covers it, and it keeps clear of
 * other hollows. Tries the columns from `near` (default the peak) outward, from just under the
 * ridge downward. Returns null if none fits.
 */
export function findPocket(bp: Blueprint, m: MountainRec, rx: number, ry: number, wall: number, near?: number): Pocket | null {
  const info = bp.registry.strokes.get(m.id);
  const planes = bp.planes;
  if (!info || !planes) return null;
  const grid = planes[m.plane];
  const [bx0, , bx1, by1] = info.bbox;
  const taken = pockets.get(bp) ?? [];
  const solid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= bp.w || y >= bp.h) return false;
    const i = y * bp.w + x;
    if (grid.el[i] !== El.ROCK || grid.owner[i] !== m.id) return false;
    for (let q = 0; q < m.plane; q++) if (planes[q].el[i] !== El.EMPTY) return false; // hidden behind something nearer
    return true;
  };
  const fits = (cx: number, cy: number) => {
    const p = { cx, cy, rx: rx + wall, ry: ry + wall };
    for (let y = Math.floor(cy - p.ry); y <= Math.ceil(cy + p.ry); y++) {
      for (let x = Math.floor(cx - p.rx); x <= Math.ceil(cx + p.rx); x++) if (inside(p, x, y) && !solid(x, y)) return false;
    }
    return !taken.some((t) => Math.abs(t.cx - cx) < t.rx + rx + wall * 2 && Math.abs(t.cy - cy) < t.ry + ry + wall * 2);
  };
  const center = Math.round(near ?? info.anchor[0]);
  for (let d = 0; d <= bx1 - bx0; d += 2) {
    for (const x of d === 0 ? [center] : [center - d, center + d]) {
      if (x < bx0 || x > bx1) continue;
      const top = topIn(bp, grid, x);
      for (let y = top + ry + wall + 2; y <= by1 - ry - wall - 2; y++) if (fits(x, y)) return { cx: x, cy: y, rx, ry };
    }
  }
  return null;
}

/**
 * Hollow the pocket out of every plane: its cells become EMPTY (no owner), and the art there is a
 * dim cave wash in the host's plane (with a dark rim around it) over nothing, so the hollow, and
 * whatever lives in it, shows through the mountain.
 */
export function carvePocket(bp: Blueprint, p: Pocket, hostPlane: number): void {
  (pockets.get(bp) ?? (pockets.set(bp, []), pockets.get(bp)!)).push(p);
  const art = artOf(bp);
  const K = art.u.k;
  for (let y = Math.floor(p.cy - p.ry); y <= Math.ceil(p.cy + p.ry); y++) {
    for (let x = Math.floor(p.cx - p.rx); x <= Math.ceil(p.cx + p.rx); x++) {
      if (x < 0 || y < 0 || x >= bp.w || y >= bp.h || !inside(p, x, y)) continue;
      const i = y * bp.w + x;
      for (const g of bp.planes ?? []) {
        g.el[i] = El.EMPTY;
        g.owner[i] = 0;
      }
    }
  }
  const cave = rgba(150, 142, 128, 120);
  const rim = rgba(30, 28, 26, 150);
  const host = art.planes[hostPlane].buf;
  for (let ay = Math.floor((p.cy - p.ry - 1) * K); ay < Math.ceil((p.cy + p.ry + 2) * K); ay++) {
    for (let ax = Math.floor((p.cx - p.rx - 1) * K); ax < Math.ceil((p.cx + p.rx + 2) * K); ax++) {
      if (ax < 0 || ay < 0 || ax >= art.u.artW || ay >= art.u.artH) continue;
      const j = ay * art.u.artW + ax;
      if (inside(p, Math.floor(ax / K), Math.floor(ay / K))) {
        for (const q of art.planes) {
          q.buf.px[j] = 0;
          q.buf.own[j] = 0;
        }
        art.bg.px[j] = 0;
        host.px[j] = cave;
      } else if (inside({ ...p, rx: p.rx + 1.2, ry: p.ry + 1.2 }, ax / K - 0.5, ay / K - 0.5)) {
        host.blend(j, rim);
      }
    }
  }
}
