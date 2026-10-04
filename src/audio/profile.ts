/**
 * Reads a World the way a musician reads a scroll: the surface height across the picture, where
 * the peaks and dips are, and how much water, fire, trees and life there is. Pure, no Web Audio.
 */
import { El, SOLID_FOR_SCAN, elements } from '../core/elements';

/** Anything with a grid of elements: a live World, or a Blueprint before it is revealed. */
export interface Grid {
  w: number;
  h: number;
  el: Uint8Array;
}

/** The scroll is read in this many slices from left to right. */
export const STEPS = 32;

export interface Landscape {
  /** Surface height of each slice, 0..1 of the grid height. */
  heights: Float32Array;
  /** Slice indices that are local peaks / dips. */
  peaks: number[];
  dips: number[];
  /** Mean height, 0..1. */
  mean: number;
  /** How jagged the skyline is, 0..1 (mean slope between neighbouring slices). */
  rugged: number;
  /** How much of each thing is on the scroll, 0..1 (saturates at a small share of the grid). */
  water: number;
  fire: number;
  trees: number;
  birds: number;
  people: number;
}

/** A peak is the highest slice within NEAR and at least PROMINENCE above the lowest within FAR. */
const NEAR = 2;
const FAR = 4;
const PROMINENCE = 0.1;

const idByName = new Map<string, number>();
function idOf(name: string): number {
  let id = idByName.get(name);
  if (id === undefined) {
    id = elements.all().find((e) => e.name === name)?.id ?? -1;
    idByName.set(name, id);
  }
  return id;
}

const sat = (count: number, full: number) => Math.min(1, count / full);

/** Average surface height per slice. A column's surface is its topmost solid cell. */
export function sliceHeights(world: Grid, steps = STEPS): Float32Array {
  const out = new Float32Array(steps);
  for (let s = 0; s < steps; s++) {
    const x0 = Math.floor((s * world.w) / steps);
    const x1 = Math.max(x0 + 1, Math.floor(((s + 1) * world.w) / steps));
    let sum = 0;
    for (let x = x0; x < x1; x++) {
      for (let y = 0; y < world.h; y++) {
        if (SOLID_FOR_SCAN[world.el[y * world.w + x]]) {
          sum += world.h - y;
          break;
        }
      }
    }
    out[s] = sum / (x1 - x0) / world.h;
  }
  return out;
}

/** Slices that stand out from their surroundings (a plateau counts once, at its first slice). */
export function findExtrema(heights: Float32Array): { peaks: number[]; dips: number[] } {
  const peaks: number[] = [];
  const dips: number[] = [];
  const n = heights.length;
  const range = (i: number, r: number, pick: (a: number, b: number) => number, start: number) => {
    let v = start;
    for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) v = pick(v, heights[k]);
    return v;
  };
  for (let i = 1; i < n - 1; i++) {
    const h = heights[i];
    if (heights[i - 1] === h) continue;
    if (h >= range(i, NEAR, Math.max, -Infinity) && h - range(i, FAR, Math.min, Infinity) >= PROMINENCE) peaks.push(i);
    else if (h <= range(i, NEAR, Math.min, Infinity) && range(i, FAR, Math.max, -Infinity) - h >= PROMINENCE) dips.push(i);
  }
  return { peaks, dips };
}

const counts = new Uint32Array(256);

/** Read the whole grid. Costs about one pass over it, so call it every few beats. */
export function readLandscape(world: Grid, steps = STEPS): Landscape {
  const heights = sliceHeights(world, steps);
  const { peaks, dips } = findExtrema(heights);
  let mean = 0;
  let slope = 0;
  for (let i = 0; i < steps; i++) {
    mean += heights[i];
    if (i) slope += Math.abs(heights[i] - heights[i - 1]);
  }
  counts.fill(0);
  const size = world.w * world.h;
  for (let i = 0; i < size; i++) counts[world.el[i]]++;
  const c = (name: string) => {
    const id = idOf(name);
    return id < 0 ? 0 : counts[id];
  };
  return {
    heights,
    peaks,
    dips,
    mean: mean / steps,
    rugged: Math.min(1, (slope / (steps - 1)) * 6),
    water: sat(counts[El.WATER], size * 0.01),
    fire: sat(counts[El.FIRE], size * 0.0005),
    trees: sat(counts[El.TREE] + c('bamboo'), size * 0.01),
    birds: sat(c('bird') + c('butterfly'), 6),
    people: sat(c('person'), 4),
  };
}
