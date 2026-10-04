import type { LevelDims } from '../core/constants';
import type { GenParams } from '../core/params';
import { DEFAULT_THRESHOLDS } from '../core/scan';
import type { SetpieceSpec } from '../core/setpieces';
import { DEPTH, FOOT_SKIRT } from './layout';
import { hintsFor, makePlan, pickPeaks, scoreCurve, type Depth } from './plan';
import { findPeaks, REFERENCE_H } from './scan';
import { getShape } from './shapes';
import { units } from './units';

/** One planned mountain's silhouette, in cells (art at k = 1): y = 0 at the top. */
export interface SkyMountain {
  /** Index in the plan: the key for a per-mountain height edit. */
  index: number;
  kind: string;
  depth: Depth;
  /** Foot of the mountain. */
  base: number;
  /** Where the scanner measures it from: the cell row below the occluder's skirt. */
  foot: number;
  /** Silhouette top per column, from x0; `h` where the shape is absent. */
  x0: number;
  tops: Float32Array;
  peakX: number;
  peakY: number;
  /**
   * The peak the scanner would count for this mountain, or undefined (hidden behind a nearer one,
   * not prominent enough, or a plateau). `rise` is measured from the mountain's own foot, the way
   * the scanner measures; `tall` = rise of at least tallFrac of the grid height.
   */
  peak?: { x: number; rise: number; tall: boolean };
}

export interface Skyline {
  w: number;
  h: number;
  /** Top of the ground strip at the bottom of the scroll. */
  floorY: number;
  /** Back to front: far ridges first, then by foot (the order the mountains feature paints). */
  mountains: SkyMountain[];
  /** Rise (cells above a mountain's foot) at which the scanner calls a peak tall. */
  tallRise: number;
  /** Centres of the mountain groups the planner picked (level mountains included), cells, left to right. */
  groups: number[];
  /** The least distance kept between group centres (set by spacing), cells. */
  minApart: number;
  /** Cells per painting unit. */
  cellsPerUnit: number;
}

/**
 * The planned mountains as silhouettes, without painting anything: the same plan and shapes the
 * mountains feature uses, built at one art pixel per cell. Cheap enough to redo on every pointer
 * move, so a page can preview edits before it regenerates.
 */
export function skyline(
  seed: number,
  params: GenParams,
  dims: LevelDims,
  setpieces: SetpieceSpec[] = [],
  heights?: Record<number, number>,
): Skyline {
  const u = units(dims, 1);
  const hints = hintsFor(setpieces);
  const plan = makePlan(seed, params, u, hints, heights);
  // The same group centres makePlan() picks (its step 1), for the spacing ruler.
  const curve = scoreCurve(seed, params.spacing, u.widthUnits);
  const forced = (hints?.mountains ?? []).filter((f) => f.kind !== 'flat').map((f) => f.x * u.widthUnits);
  const groups = pickPeaks(curve, forced).map((x) => u.toArt(x)).sort((a, b) => a - b);
  const mountains: SkyMountain[] = [];
  plan.forEach((p, index) => {
    if (p.height <= 0) return;
    const base = u.toArt(p.y);
    const pr = getShape(p.kind).build(p, { u, params, base });
    if (pr.tops.length === 0) return;
    mountains.push({ index, kind: p.kind, depth: p.depth, base, foot: Math.ceil(base + u.toArt(FOOT_SKIRT)), x0: pr.x0, tops: pr.tops, peakX: pr.peakX, peakY: pr.peakY });
  });
  mountains.sort((a, b) => (a.depth === 'far' ? 0 : 1) - (b.depth === 'far' ? 0 : 1) || a.base - b.base);
  const tallRise = DEFAULT_THRESHOLDS.tallFrac * u.artH;
  markPeaks(mountains, u.artW, u.artH, DEPTH.floor * u.artH, tallRise);
  return {
    w: u.artW,
    h: u.artH,
    floorY: DEPTH.floor * u.artH,
    mountains,
    tallRise,
    groups,
    minApart: u.toArt(curve.minApart),
    cellsPerUnit: u.artPerUnit,
  };
}

/**
 * The scanner's peaks (gen/scan.ts), read off the silhouettes instead of cells: the top edge of
 * the scanned (near and mid) mountains, its prominent local maxima, each given to the mountain on
 * top in that column and measured from that mountain's foot, the highest one per mountain.
 * Trees are not planned yet, so a tree on a ridge can still add a little in the real scan.
 */
function markPeaks(mountains: SkyMountain[], w: number, h: number, floorY: number, tallRise: number): void {
  const top = new Float32Array(w).fill(floorY);
  const owner = new Int32Array(w).fill(-1);
  mountains.forEach((m, i) => {
    if (m.depth === 'far') return;
    for (let j = 0; j < m.tops.length; j++) {
      const x = m.x0 + j;
      if (x < 0 || x >= w || m.tops[j] >= m.base) continue;
      if (m.tops[j] < top[x]) {
        top[x] = m.tops[j];
        owner[x] = i;
      }
    }
  });
  const heights = new Int16Array(w);
  for (let x = 0; x < w; x++) heights[x] = h - Math.round(top[x]); // a cell is filled when its coverage passes half
  const minProm = DEFAULT_THRESHOLDS.minProminence * Math.max(1, h / REFERENCE_H);
  for (const raw of findPeaks(heights, minProm)) {
    const i = owner[raw.x];
    if (i < 0) continue;
    const m = mountains[i];
    if (m.kind === 'flat') continue; // plateaus are land, not mountains
    const rise = Math.min(raw.h, m.foot - (h - raw.h));
    if (rise < Math.max(1, minProm)) continue;
    if (!m.peak || rise > m.peak.rise) m.peak = { x: raw.x, rise, tall: rise >= tallRise };
  }
}
