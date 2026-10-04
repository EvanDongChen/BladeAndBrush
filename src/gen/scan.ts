import { El, ELEMENTS, SOLID_FOR_SCAN } from '../core/elements';
import { indexObjects } from '../core/objects';
import { DEFAULT_THRESHOLDS, metrics, type Peak, type ScanResult, type ScanThresholds } from '../core/scan';
import type { World } from '../core/world';

/** Grid height (cells) the default thresholds were written for. */
export const REFERENCE_H = 256;

/** PHASE 0: correct but naive. A replaces the internals; the signatures are the contract. */

/** Height of the topmost solidForScan cell in column x (0 if none). */
export function heightAt(world: World, x: number): number {
  for (let y = 0; y < world.h; y++) if (SOLID_FOR_SCAN[world.el[y * world.w + x]]) return world.h - y;
  return 0;
}

export function columnHeights(world: World): Int16Array {
  const out = new Int16Array(world.w);
  for (let x = 0; x < world.w; x++) out[x] = heightAt(world, x);
  return out;
}

/**
 * Strict local maxima (plateaus count once, at their middle; edges never count), with
 * topographic prominence: height minus the higher of the lowest points on each side before
 * reaching higher ground (or the edge). Of two equally high peaks the left one counts as the
 * higher, so twin summits of one mountain (e.g. two trees on its ridge) are one peak, not two.
 */
export function findPeaks(heights: Int16Array, minProminence = 0): Peak[] {
  const n = heights.length;
  const peaks: Peak[] = [];
  let i = 1;
  while (i < n - 1) {
    if (heights[i] <= heights[i - 1]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && heights[j + 1] === heights[i]) j++;
    if (j + 1 < n && heights[j + 1] < heights[i]) {
      const x = (i + j) >> 1;
      const h = heights[x];
      let leftMin = h;
      for (let k = i - 1; k >= 0 && heights[k] < h; k--) leftMin = Math.min(leftMin, heights[k]);
      let rightMin = h;
      for (let k = j + 1; k < n && heights[k] <= h; k++) rightMin = Math.min(rightMin, heights[k]);
      const prominence = h - Math.max(leftMin, rightMin);
      if (prominence >= minProminence) peaks.push({ x, h, prominence });
    }
    i = j + 1;
  }
  return peaks;
}

/** Number of 4-connected components of non-zero cells in `mask` (w*h, row-major). */
export function countComponents(w: number, h: number, mask: Uint8Array): number {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let top = 0;
  const visit = (j: number) => {
    if (mask[j] && !seen[j]) {
      seen[j] = 1;
      stack[top++] = j;
    }
  };
  let count = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    count++;
    visit(start);
    while (top > 0) {
      const i = stack[--top];
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (y > 0) visit(i - w);
      if (y < h - 1) visit(i + w);
    }
  }
  return count;
}

/**
 * 1 for every cell that open air connects to the top row (4-connected flood fill through empty
 * space, gas and projectiles such as creatures; rock, wood, water... block it). "Out in the open".
 */
export function skyReach(world: World): Uint8Array {
  const open = new Uint8Array(256);
  for (let e = 0; e < 256; e++) {
    const d = ELEMENTS[e];
    const k = d?.kind;
    // things hanging in the sky (clouds, the moon) and visual-only ink stains do not wall anything in
    open[e] = k === 'empty' || k === 'gas' || k === 'projectile' || e === El.STAIN || (d?.anchored && !d.solidForScan) ? 1 : 0;
  }
  const { w, h, el, size } = world;
  const seen = new Uint8Array(size);
  const stack = new Int32Array(size);
  let top = 0;
  const visit = (j: number) => {
    if (!seen[j] && open[el[j]]) {
      seen[j] = 1;
      stack[top++] = j;
    }
  };
  for (let x = 0; x < w; x++) visit(x);
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (y > 0) visit(i - w);
    if (y < h - 1) visit(i + w);
  }
  return seen;
}

/**
 * One peak per mountain: peaks standing on the same tracked mountain object (core/objects.ts) are
 * one mountain, however rugged its ridge, so only its highest peak is kept. A peak's mountain is
 * the first 'mountain' object found going down its column past anything standing on it (trees,
 * boulders, flowers, bamboo). A peak on land (a plateau, tagged 'plateau') or on a hut is not a
 * mountain and is dropped, and so is a tree or boulder standing on land that is no mountain. Peaks
 * on bare untracked terrain (painted in the sandbox) stay as they are.
 */
export function peaksByMountain(world: World, heights: Int16Array, peaks: Peak[], minProminence = 0): Peak[] {
  if (world.objects.size === 0) return peaks;
  const best = new Map<number, Peak>();
  const out: Peak[] = [];
  for (const raw of peaks) {
    const top = world.h - heights[raw.x];
    const id = mountainUnder(world, raw.x, top);
    if (id < 0) continue;
    if (id === 0) {
      // Something tracked that is not a mountain (a tree, a boulder...) standing on land that is no
      // mountain is not a peak: a tall tree on the flat ground must not count as a tall mountain.
      const standing = world.obj[top * world.w + raw.x];
      if (standing !== 0 && world.objects.get(standing)?.kind !== 'mountain') continue;
      out.push(raw);
      continue;
    }
    // A tracked mountain is measured from its own foot, not from the bottom of the page: the
    // painting has no ground strip, and farther mountains stand higher up. A stump (or rubble that
    // fell below the foot) lower than minProminence is no peak.
    const foot = world.objects.get(id)!.bbox[3] + 1;
    const h = Math.min(raw.h, foot - top);
    if (h < Math.max(1, minProminence)) continue;
    const p = { x: raw.x, h, prominence: Math.min(raw.prominence, h) };
    const prev = best.get(id);
    if (!prev || p.h > prev.h || (p.h === prev.h && p.prominence > prev.prominence)) best.set(id, p);
  }
  for (const p of best.values()) out.push(p);
  return out.sort((a, b) => a.x - b.x);
}

/** How far down a peak's column to look for the mountain under its trees and boulders. */
const ROOT_DEPTH = 48;

/** The mountain object under a peak: its id, 0 for untracked terrain, -1 for something that is not a mountain. */
export function mountainUnder(world: World, x: number, top: number): number {
  const { w, obj, el, objects } = world;
  for (let y = top; y < Math.min(world.h, top + ROOT_DEPTH); y++) {
    const i = y * w + x;
    const o = obj[i] === 0 ? undefined : objects.get(obj[i]);
    if (o) {
      if (o.kind === 'mountain') return o.tags.includes('plateau') ? -1 : o.id;
      if (o.kind === 'hut') return -1; // a building is not a mountain
      // anything else standing on the land (a tree, a boulder, a flower, bamboo...): look under it
    } else if (el[i] !== 0 && SOLID_FOR_SCAN[el[i]] && !ELEMENTS[el[i]]?.flammability) return 0; // untracked terrain
  }
  return 0;
}

/** Reads cells only. counts has one entry per registered metric (gen/metrics/). */
export function scan(world: World, thresholds: ScanThresholds = DEFAULT_THRESHOLDS): ScanResult {
  const heights = columnHeights(world);
  // Thresholds are vertical lengths written for a REFERENCE_H-cell-high grid; scale them UP so the
  // same painting scans the same on a finer grid (tallFrac is already a fraction). Coarser or
  // toy grids keep the plain cell lengths: a threshold below one cell would mean nothing.
  const k = Math.max(1, world.h / REFERENCE_H);
  const scaled: ScanThresholds = {
    ...thresholds,
    minProminence: thresholds.minProminence * k,
    waterfallMin: thresholds.waterfallMin * k,
  };
  const peaks = peaksByMountain(world, heights, findPeaks(heights, scaled.minProminence), scaled.minProminence);
  const ctx = { heights, peaks, thresholds: scaled, objects: indexObjects(world) };
  const counts: Record<string, number> = {};
  for (const m of metrics.all()) counts[m.name] = m.measure(world, ctx);
  return { heights, peaks, counts };
}
