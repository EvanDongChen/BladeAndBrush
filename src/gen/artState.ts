import { allocStack, type Blueprint, type PlaneGrid } from '../core/blueprint';
import { ArtBuffer } from './paint/artBuffer';
import { PixelPainter } from './paint/painter';
import { units, type Units } from './units';

/**
 * Generator planes, front to back (layered pixels). Each is painted complete; the stack order
 * decides what is in front. Trees, huts and boulders get a plane of their own in front of the
 * terrain they stand on, so breaking them exposes the terrain behind.
 */
export const PLANE = { NEAR_OBJ: 0, NEAR: 1, MID_OBJ: 2, MID: 3 } as const;
export const PLANE_COUNT = 4;

export interface GenPlane {
  buf: ArtBuffer;
  paint: PixelPainter;
  /** The cells this plane puts in the blueprint (flattened into the stack after the features run). */
  grid: PlaneGrid;
}

export interface GenArt {
  planes: GenPlane[];
  bg: ArtBuffer;
  bgPaint: PixelPainter;
  u: Units;
}

/** Gen-only state per blueprint (owner masks, painters), so features share it with no core change. */
const state = new WeakMap<Blueprint, GenArt>();

/** Art pixels per cell side unless generate() is told otherwise. */
export const DEFAULT_ART_K = 4;

/** Allocate bp.art, bp.bg, the plane grids and the gen-side wrappers. Called once by generate(). */
export function attachArt(bp: Blueprint, k: number): GenArt {
  const u = units(bp, k);
  allocStack(bp, PLANE_COUNT);
  bp.bg = new Uint8Array(bp.w * bp.h);
  const px = Array.from({ length: PLANE_COUNT }, () => new Uint32Array(u.artW * u.artH));
  bp.art = { k, planes: px, bg: new Uint32Array(u.artW * u.artH) };
  const planes = px.map((data, q): GenPlane => {
    const buf = new ArtBuffer(u.artW, u.artH, data);
    return { buf, paint: new PixelPainter(buf), grid: bp.planes![q] };
  });
  const bg = new ArtBuffer(u.artW, u.artH, bp.art.bg);
  const s: GenArt = { planes, bg, bgPaint: new PixelPainter(bg), u };
  state.set(bp, s);
  return s;
}

export function artOf(bp: Blueprint): GenArt {
  const s = state.get(bp);
  if (!s) throw new Error('artOf: blueprint has no art (create it with generate())');
  return s;
}
