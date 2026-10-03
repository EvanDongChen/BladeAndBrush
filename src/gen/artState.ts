import type { Blueprint } from '../core/blueprint';
import { ArtBuffer } from './paint/artBuffer';
import { PixelPainter } from './paint/painter';
import { units, type Units } from './units';

export interface GenArt {
  fg: ArtBuffer;
  bg: ArtBuffer;
  fgPaint: PixelPainter;
  bgPaint: PixelPainter;
  u: Units;
}

/** Gen-only state per blueprint (owner masks, painters), so features share it with no core change. */
const state = new WeakMap<Blueprint, GenArt>();

/** Art pixels per cell side unless generate() is told otherwise. */
export const DEFAULT_ART_K = 4;

/** Allocate bp.art and bp.bg and the gen-side wrappers. Called once by generate(). */
export function attachArt(bp: Blueprint, k: number): GenArt {
  const u = units(bp, k);
  bp.bg = new Uint8Array(bp.w * bp.h);
  bp.art = { k, fg: new Uint32Array(u.artW * u.artH), bg: new Uint32Array(u.artW * u.artH) };
  const fg = new ArtBuffer(u.artW, u.artH, bp.art.fg);
  const bg = new ArtBuffer(u.artW, u.artH, bp.art.bg);
  const s: GenArt = { fg, bg, fgPaint: new PixelPainter(fg), bgPaint: new PixelPainter(bg), u };
  state.set(bp, s);
  return s;
}

export function artOf(bp: Blueprint): GenArt {
  const s = state.get(bp);
  if (!s) throw new Error('artOf: blueprint has no art (create it with generate())');
  return s;
}
