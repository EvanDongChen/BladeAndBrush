import { BEHIND_LAYERS, NO_PLANE, type LevelDims } from './constants';
import { Hasher } from './hash';
import type { GenParams } from './params';

/**
 * The A -> B handoff contract. generate(seed, params) is a pure function that returns one of
 * these with the whole scroll rasterized up front. The frontier reveal copies it into a World.
 */
export interface Blueprint {
  seed: number;
  params: GenParams;
  w: number;
  h: number;
  /** Intended FRONT element per cell (the top of the stack; fully generated, whole scroll). */
  el: Uint8Array;
  owner: Uint16Array;
  /**
   * Layered pixels: the generator paints each PLANE separately (front to back, see PLANE in
   * gen/artState.ts) and generate() flattens them. `plane` is the front cell's plane (NO_PLANE
   * where empty); `behind` holds what is stacked behind it, nearest first, compact. The frontier
   * reveal copies all of it into a World, which brings a layer forward when the one in front breaks.
   */
  planes?: PlaneGrid[];
  plane?: Uint8Array;
  behind?: StackLayer[];
  registry: Registry;
  /** Vector draw commands for the art layer (empty in the Phase 0 stub). */
  draw: DrawCmd[];
  /** Background plane (same size as el): FAR_ROCK or EMPTY. Never simulated or scanned. */
  bg?: Uint8Array;
  /**
   * High-res art (section 3.8): k x k art pixels per cell, one buffer per plane. A cell's block is
   * shown only while the cell still matches the blueprint, so every visible pixel is backed by a cell.
   */
  art?: ArtBuffers;
}

/** One generator plane: what that plane puts at each cell. */
export interface PlaneGrid {
  el: Uint8Array;
  owner: Uint16Array;
}

/** One level of the stack behind the front cells. */
export interface StackLayer {
  el: Uint8Array;
  owner: Uint16Array;
  plane: Uint8Array;
}

export interface DrawCmd {
  /** In cell coordinates. */
  pts: [number, number][];
  /** rgba() CSS strings. */
  fill?: string;
  stroke?: string;
  width?: number;
  category: 'mountain' | 'tree' | 'rock' | 'water' | 'structure';
}

export interface Registry {
  /** ownerId -> info */
  strokes: Map<number, StrokeInfo>;
  waterSources: { x: number; y: number; rate: number }[];
}

export interface StrokeInfo {
  id: number;
  kind: 'mountain' | 'tree' | 'rock';
  bbox: [x0: number, y0: number, x1: number, y1: number];
  anchor: [x: number, y: number];
}

/** RGBA art at k x grid resolution, packed little-endian like rgba(). Row width is w * k. */
export interface ArtBuffers {
  k: number;
  /** One buffer per plane, front to back; each painted complete (nearer planes do not clip it). */
  planes: Uint32Array[];
  /** Background plane art (far ridges). */
  bg: Uint32Array;
}

/** The blueprint's art plus the cells it was painted for, so the art layer can tell which still match. */
export interface ArtView {
  art: ArtBuffers;
  w: number;
  h: number;
  /** The generated front cells and their planes. */
  el: Uint8Array;
  plane: Uint8Array;
  planes: PlaneGrid[];
}

/** What the renderer needs from a blueprint, or undefined if it has no art. */
export function artView(bp: Blueprint): ArtView | undefined {
  if (!bp.art || !bp.planes || !bp.plane) return undefined;
  return { art: bp.art, w: bp.w, h: bp.h, el: bp.el, plane: bp.plane, planes: bp.planes };
}

/** Allocate the plane grids and the flattened stack for `count` planes (called by generate()). */
export function allocStack(bp: Blueprint, count: number): void {
  bp.planes = Array.from({ length: count }, () => ({ el: new Uint8Array(bp.w * bp.h), owner: new Uint16Array(bp.w * bp.h) }));
  bp.plane = new Uint8Array(bp.w * bp.h).fill(NO_PLANE);
  bp.behind = Array.from({ length: BEHIND_LAYERS }, () => ({
    el: new Uint8Array(bp.w * bp.h),
    owner: new Uint16Array(bp.w * bp.h),
    plane: new Uint8Array(bp.w * bp.h).fill(NO_PLANE),
  }));
}

/**
 * Flatten the plane grids (front to back) into the front cells and the compact behind stack.
 * A cell holds, front first, every plane that has material there; empty planes leave no gap.
 */
export function flattenPlanes(bp: Blueprint): void {
  const { planes, plane, behind } = bp;
  if (!planes || !plane || !behind) return;
  const size = bp.w * bp.h;
  for (let i = 0; i < size; i++) {
    let depth = -1; // -1 = front, 0.. = behind index
    for (let q = 0; q < planes.length; q++) {
      const e = planes[q].el[i];
      if (e === 0) continue;
      if (depth < 0) {
        bp.el[i] = e;
        bp.owner[i] = planes[q].owner[i];
        plane[i] = q;
      } else if (depth < behind.length) {
        behind[depth].el[i] = e;
        behind[depth].owner[i] = planes[q].owner[i];
        behind[depth].plane[i] = q;
      }
      depth++;
    }
  }
}

export function createBlueprint(seed: number, params: GenParams, dims: LevelDims): Blueprint {
  return {
    seed,
    params: { ...params },
    w: dims.w,
    h: dims.h,
    el: new Uint8Array(dims.w * dims.h),
    owner: new Uint16Array(dims.w * dims.h),
    registry: { strokes: new Map(), waterSources: [] },
    draw: [],
  };
}

/** Deterministic hash of everything generate() produces (except the art canvas). */
export function hashBlueprint(bp: Blueprint): number {
  const h = new Hasher().int(bp.seed).int(bp.w).int(bp.h).bytes(bp.el).u16(bp.owner);
  for (const s of bp.registry.strokes.values()) {
    h.int(s.id).int(s.kind.length).int(s.bbox[0]).int(s.bbox[1]).int(s.bbox[2]).int(s.bbox[3]);
    h.int(s.anchor[0]).int(s.anchor[1]);
  }
  for (const w of bp.registry.waterSources) h.int(w.x).int(w.y).int(Math.round(w.rate * 1000));
  if (bp.plane) h.bytes(bp.plane);
  for (const b of bp.behind ?? []) h.bytes(b.el).u16(b.owner).bytes(b.plane);
  if (bp.bg) h.bytes(bp.bg);
  if (bp.art) {
    h.int(bp.art.k).u32(bp.art.bg);
    for (const p of bp.art.planes) h.u32(p);
  }
  h.int(bp.draw.length);
  return h.digest();
}
