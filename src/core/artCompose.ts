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

/** The art with its per-mode blends computed once, so each frame only copies pixels. */
export interface PreparedArt {
  k: number;
  /** Background only (cell removed). */
  bg: Uint32Array;
  /** fg over bg (untouched empty cell: soft edges, far ridges). */
  sky: Uint32Array;
  /** fg over bg over paper (untouched solid cell; opaque). */
  solid: Uint32Array;
  /** The pre-overpaint rock art over bg over paper, if the art has `under`. */
  under: Uint32Array | null;
}

const prepared = new WeakMap<ArtBuffers, PreparedArt>();

/** Precompute (once per art, cached) the blends compose() needs. */
export function prepareArt(art: ArtBuffers): PreparedArt {
  let p = prepared.get(art);
  if (p) return p;
  const n = art.fg.length;
  const sky = new Uint32Array(n);
  const solid = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    sky[i] = over(art.fg[i], art.bg[i]);
    solid[i] = over(sky[i], PAPER_RGBA);
  }
  let under: Uint32Array | null = null;
  if (art.under) {
    under = new Uint32Array(n);
    for (let i = 0; i < n; i++) under[i] = over(over(art.under[i], art.bg[i]), PAPER_RGBA);
  }
  p = { k: art.k, bg: art.bg, sky, solid, under };
  prepared.set(art, p);
  return p;
}

/**
 * Build the art image (w*k x h*k) for this frame. Every art pixel belongs to a cell. Per cell,
 * left of frontierX:
 * - world cell non-empty and equal to the blueprint cell: solid (fg over bg over paper)
 * - world cell EMPTY and blueprint EMPTY (untouched sky): sky (fg over bg)
 * - world cell ROCK where the blueprint has something else on rock (a burnt face tree): under
 * - world cell EMPTY but blueprint not (slashed, burnt, nulled): bg only
 * - anything else (water, fire, ... drawn by the cells layer): transparent
 */
export function compose(
  out: Uint32Array,
  worldEl: Uint8Array,
  bpEl: Uint8Array,
  w: number,
  h: number,
  art: PreparedArt,
  frontierX: number,
): void {
  const { k } = art;
  const aw = w * k;
  const fx = Math.max(0, Math.min(w, frontierX));
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const we = worldEl[i];
      const be = bpEl[i];
      const src =
        cx >= fx
          ? null
          : we !== El.EMPTY
            ? we === be
              ? art.solid
              : we === El.ROCK && be !== El.EMPTY
                ? art.under
                : null
            : be === El.EMPTY
              ? art.sky
              : art.bg;
      const base = cy * k * aw + cx * k;
      for (let yy = 0; yy < k; yy++) {
        let p = base + yy * aw;
        if (src) for (let xx = 0; xx < k; xx++, p++) out[p] = src[p];
        else for (let xx = 0; xx < k; xx++, p++) out[p] = 0;
      }
    }
  }
}
