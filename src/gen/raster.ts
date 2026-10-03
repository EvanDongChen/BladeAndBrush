import type { Blueprint } from '../core/blueprint';
import { El } from '../core/elements';

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
