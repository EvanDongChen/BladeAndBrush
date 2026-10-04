import { createBlueprint, flattenPlanes, type Blueprint } from '../core/blueprint';
import { featureOn } from '../core/config';
import { DEFAULT_DIMS, type LevelDims } from '../core/constants';
import { features, type Feature, type FeatureCtx } from '../core/features';
import { IS_STATIC } from '../core/elements';
import { createNoise } from '../core/noise';
import type { GenParams } from '../core/params';
import { byOrder } from '../core/registry';
import { hashSeed, Rng } from '../core/rng';
import { setpieceOf, type SetpieceSpec } from '../core/setpieces';
import { attachArt, DEFAULT_ART_K } from './artState';
import { mountainsOf } from './mountainStore';

export interface GenerateOptions {
  dims?: LevelDims;
  /** Per-call feature toggles; win over core/config.ts featureToggles. */
  features?: Record<string, boolean>;
  /** Art pixels per cell side (default DEFAULT_ART_K). */
  k?: number;
  /** What the level puts in on top of the free painting (core/setpieces.ts). */
  setpieces?: SetpieceSpec[];
}

/** Registered features that are switched on, in pipeline order. */
export function enabledFeatures(overrides?: Record<string, boolean>): Feature[] {
  return features
    .all()
    .filter((f) => featureOn(f.name, overrides))
    .sort(byOrder);
}

/** One pipeline step: a feature, or one setpiece spec that has a run(). */
interface Stage {
  name: string;
  order: number;
  run(ctx: FeatureCtx): void;
}

/**
 * Features plus the level's setpieces, in order. A setpiece runs right after the features with
 * the same order; several specs of one type run in the order the level lists them.
 */
function pipeline(specs: SetpieceSpec[], overrides?: Record<string, boolean>): Stage[] {
  const stages: Stage[] = enabledFeatures(overrides).map((f) => ({ name: f.name, order: f.order, run: (ctx) => f.run(ctx) }));
  specs.forEach((spec, i) => {
    const s = setpieceOf(spec);
    if (s.run && s.order !== undefined) stages.push({ name: `setpiece:${spec.type}:${i}`, order: s.order + 0.5, run: (ctx) => s.run!(ctx, spec) });
  });
  return stages.sort(byOrder);
}

/**
 * Pure: same (seed, params, options) and same registered features give the same Blueprint.
 * Runs every enabled feature (and setpiece) in order; each gets its own rng/noise derived from the seed.
 */
export function generate(seed: number, params: GenParams, opts: GenerateOptions = {}): Blueprint {
  const dims = opts.dims ?? DEFAULT_DIMS;
  const bp = createBlueprint(seed, params, dims, opts.setpieces);
  attachArt(bp, opts.k ?? DEFAULT_ART_K);
  let nextOwner = 1;
  const newStroke: FeatureCtx['newStroke'] = (info) => {
    const id = nextOwner++;
    bp.registry.strokes.set(id, { id, ...info });
    return id;
  };
  for (const stage of pipeline(bp.setpieces, opts.features)) {
    stage.run({
      seed,
      params: bp.params,
      dims,
      bp,
      rng: new Rng(hashSeed(seed, stage.name)),
      noise: createNoise(hashSeed(seed, stage.name, 'noise')),
      newStroke,
    });
  }
  markFeet(bp);
  flattenPlanes(bp); // layered pixels: planes -> front cells + the stack behind them
  anchorLoose(bp);
  return bp;
}

/**
 * The painting has no ground strip: mountains and plateaus stand on land that is only implied. Mark
 * the bottom cell of each of their columns (bp.foot, revealed as Flag.FOOT) so the sim knows they
 * rest on something; anything cut loose above that still falls.
 */
function markFeet(bp: Blueprint): void {
  const planes = bp.planes;
  if (!planes) return;
  const foot = (bp.foot = new Uint8Array(bp.w * bp.h));
  for (const m of mountainsOf(bp)) {
    const info = bp.registry.strokes.get(m.id);
    if (!info) continue;
    const g = planes[m.plane];
    const [x0, y0, x1, y1] = info.bbox;
    for (let x = Math.max(0, x0); x <= Math.min(bp.w - 1, x1); x++) {
      for (let y = Math.min(bp.h - 1, y1); y >= Math.max(0, y0); y--) {
        const i = y * bp.w + x;
        if (g.owner[i] === m.id && g.el[i] !== 0) {
          foot[i] = 1;
          break;
        }
      }
    }
  }
}

/**
 * Bits of the painting that are not joined to any foot as generated (a canopy the rasterizer left
 * a cell apart from its trunk, a sliver of rock) are part of the picture, not loose: mark them
 * bp.cling, so they hold on to whatever is next to them and only fall once that is cut or burnt away.
 */
function anchorLoose(bp: Blueprint): void {
  const foot = bp.foot;
  if (!foot) return;
  const cling = (bp.cling = new Uint8Array(bp.w * bp.h));
  const { w, h, el } = bp;
  const size = w * h;
  const seen = new Uint8Array(size);
  const stack = new Int32Array(size);
  let top = 0;
  const solid = (i: number) => el[i] !== 0 && IS_STATIC[el[i]] === 1;
  const added: number[] = []; // cells the last flood reached
  const visit = (i: number) => {
    if (!seen[i] && solid(i)) {
      seen[i] = 1;
      stack[top++] = i;
      added.push(i);
    }
  };
  const flood = () => {
    while (top > 0) {
      const i = stack[--top];
      const x = i % w;
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (i >= w) visit(i - w);
      if (i < size - w) visit(i + w);
    }
  };
  for (let i = 0; i < size; i++) if (foot[i] || i >= (h - 1) * w) visit(i);
  flood();
  // what clings, by the sim's rule (sim/behaviors/rigid.ts): held material within 2 cells, or held
  // material of its own object or of what it stands on within 6 (in front or stacked behind),
  // clings; anything else floats in the picture on its own and stays where it was painted
  const owner = bp.owner;
  const groupOf = (id: number) => (id === 0 ? 0 : (bp.registry.strokes.get(id)?.group ?? 0));
  const kin = (pos: number, id: number, group: number): boolean => {
    if (!seen[pos]) return false;
    const o = owner[pos];
    if (o !== 0 && (o === id || o === group)) return true;
    for (const layer of bp.behind ?? []) {
      const b = layer.owner[pos];
      if (b !== 0 && (b === id || b === group)) return true;
    }
    return false;
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < size; i++) {
      if (seen[i] || !solid(i)) continue;
      const x = i % w;
      const y = (i / w) | 0;
      const id = owner[i];
      const group = groupOf(id);
      let held = false;
      for (let dy = -6; dy <= 6 && !held; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -6; dx <= 6; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const pos = ny * w + nx;
          const near = dx >= -2 && dx <= 2 && dy >= -2 && dy <= 2;
          if ((near && seen[pos]) || (id !== 0 && kin(pos, id, group))) {
            held = true;
            break;
          }
        }
      }
      if (!held) continue;
      added.length = 0;
      seen[i] = 1;
      stack[top++] = i;
      added.push(i);
      flood();
      changed = true;
      for (const j of added) cling[j] = 1;
    }
  }
  for (let i = 0; i < size; i++) if (!seen[i] && solid(i)) foot[i] = 1;
}
