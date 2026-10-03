import type { LevelDims } from './constants';
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
  /** Intended element per cell (fully generated, whole scroll). */
  el: Uint8Array;
  owner: Uint16Array;
  registry: Registry;
  /** Vector draw commands for the art layer (empty in the Phase 0 stub). */
  draw: DrawCmd[];
  /** Optional pre-rendered art (section 3.8). Built from `draw` by whoever implements the art layer. */
  art?: ArtLayer;
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

/** Hook for the hybrid renderer: art drawn at `scale` x grid resolution. */
export interface ArtLayer {
  canvas: CanvasImageSource;
  scale: number;
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
  h.int(bp.draw.length);
  return h.digest();
}
