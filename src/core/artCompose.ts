import type { ArtBuffers } from './blueprint';
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

/**
 * Build the art image (w*k x h*k) for this frame. Every art pixel belongs to a cell. Per cell,
 * left of frontierX:
 * - world cell non-empty and equal to the blueprint cell: fg over bg over paper (opaque)
 * - world cell EMPTY and blueprint EMPTY (untouched sky): fg over bg (soft edges, far ridges)
 * - world cell EMPTY but blueprint not (slashed, burnt, nulled): bg only
 * - anything else (water, fire, ... drawn by the cells layer): transparent
 */
export function compose(
  out: Uint32Array,
  worldEl: Uint8Array,
  bpEl: Uint8Array,
  w: number,
  h: number,
  art: ArtBuffers,
  frontierX: number,
): void {
  const { k, fg, bg } = art;
  const aw = w * k;
  const fx = Math.max(0, Math.min(w, frontierX));
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const we = worldEl[i];
      const be = bpEl[i];
      const mode = cx >= fx ? 0 : we !== El.EMPTY ? (we === be ? 2 : 0) : be === El.EMPTY ? 1 : 3;
      const base = cy * k * aw + cx * k;
      for (let yy = 0; yy < k; yy++) {
        let p = base + yy * aw;
        for (let xx = 0; xx < k; xx++, p++) {
          out[p] =
            mode === 0 ? 0 : mode === 3 ? bg[p] : mode === 1 ? over(fg[p], bg[p]) : over(over(fg[p], bg[p]), PAPER_RGBA);
        }
      }
    }
  }
}
