import type { Blueprint } from '../core/blueprint';
import { El } from '../core/elements';
import type { ArtBuffer } from './paint/artBuffer';

/** y of the topmost non-empty blueprint cell in column x, or bp.h if the column is empty. */
export function surfaceY(bp: Blueprint, x: number): number {
  for (let y = 0; y < bp.h; y++) if (bp.el[y * bp.w + x] !== El.EMPTY) return y;
  return bp.h;
}

/** Write one blueprint cell if it is in bounds and (unless `overwrite`) currently empty. */
export function put(bp: Blueprint, x: number, y: number, el: number, owner: number, overwrite = false): boolean {
  if (x < 0 || y < 0 || x >= bp.w || y >= bp.h) return false;
  const i = y * bp.w + x;
  if (!overwrite && bp.el[i] !== El.EMPTY) return false;
  bp.el[i] = el;
  bp.owner[i] = owner;
  return true;
}

/**
 * Cells follow the art: set (x, y) to `el`/`owner` when at least half of its k x k block is owned
 * by `owner` in `buf`. bbox is in cells (inclusive). `cells` is the blueprint itself for the
 * foreground, or the background plane. Returns the bbox of the cells set, or null.
 */
export function rasterizeCoverage(
  bp: Blueprint,
  buf: ArtBuffer,
  k: number,
  owner: number,
  el: number,
  cells: { el: Uint8Array; owner: Uint16Array },
  bbox: [number, number, number, number],
  overwrite: boolean,
): [number, number, number, number] | null {
  const need = Math.ceil((k * k) / 2);
  const x0 = Math.max(0, bbox[0]);
  const y0 = Math.max(0, bbox[1]);
  const x1 = Math.min(bp.w - 1, bbox[2]);
  const y1 = Math.min(bp.h - 1, bbox[3]);
  let out: [number, number, number, number] | null = null;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let n = 0;
      for (let yy = 0; yy < k; yy++) {
        const row = (y * k + yy) * buf.w + x * k;
        for (let xx = 0; xx < k; xx++) if (buf.own[row + xx] === owner) n++;
      }
      if (n < need) continue;
      const i = y * bp.w + x;
      if (!overwrite && cells.el[i] !== El.EMPTY) continue;
      cells.el[i] = el;
      cells.owner[i] = owner;
      if (!out) out = [x, y, x, y];
      else {
        out[0] = Math.min(out[0], x);
        out[1] = Math.min(out[1], y);
        out[2] = Math.max(out[2], x);
        out[3] = Math.max(out[3], y);
      }
    }
  }
  return out;
}
