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
  /** Background plane (same size as el): FAR_ROCK or EMPTY. Never simulated or scanned. */
  bg?: Uint8Array;
  /** 1 where a fuel cell grows over rock (a tree on a mountain face): revealed with Flag.ON_ROCK. */
  onRock?: Uint8Array;
  /**
   * High-res art (section 3.8): k x k art pixels per cell. A cell's block is shown only while the
   * cell still matches the blueprint, so every visible pixel is backed by a cell.
   */
  art?: ArtBuffers;
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
  /** Foreground plane art (mountains, trees...). Transparent where nothing was painted. */
  fg: Uint32Array;
  /** Background plane art (far ridges). */
  bg: Uint32Array;
  /** Foreground art from before things were painted over rock: shown once a face tree has burnt back to rock. */
  under?: Uint32Array;
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
  if (bp.bg) h.bytes(bp.bg);
  if (bp.onRock) h.bytes(bp.onRock);
  if (bp.art) h.int(bp.art.k).u32(bp.art.fg).u32(bp.art.bg);
  if (bp.art?.under) h.u32(bp.art.under);
  h.int(bp.draw.length);
  return h.digest();
}
