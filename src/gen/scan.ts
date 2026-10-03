import { SOLID_FOR_SCAN } from '../core/elements';
import { DEFAULT_THRESHOLDS, metrics, type Peak, type ScanResult, type ScanThresholds } from '../core/scan';
import type { World } from '../core/world';

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
 * reaching higher ground (or the edge).
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
      for (let k = i - 1; k >= 0 && heights[k] <= h; k--) leftMin = Math.min(leftMin, heights[k]);
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

/** Reads cells only. counts has one entry per registered metric (gen/metrics/). */
export function scan(world: World, thresholds: ScanThresholds = DEFAULT_THRESHOLDS): ScanResult {
  const heights = columnHeights(world);
  const peaks = findPeaks(heights, thresholds.minProminence);
  const ctx = { heights, peaks, thresholds };
  const counts: Record<string, number> = {};
  for (const m of metrics.all()) counts[m.name] = m.measure(world, ctx);
  return { heights, peaks, counts };
}
