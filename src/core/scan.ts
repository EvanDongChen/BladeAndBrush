import { ExtensionRegistry } from './registry';
import type { World } from './world';

/** Shared shape of the scanner (section 3.7). A implements scan() in gen/scan.ts. */
export interface ScanThresholds {
  /** A peak at least this fraction of the grid height counts as a tall mountain. */
  tallFrac: number;
  /** Peaks with less prominence (in cells) are ignored. */
  minProminence: number;
  /** Minimum vertical WATER run (in cells) to count as a waterfall. */
  waterfallMin: number;
}

export const DEFAULT_THRESHOLDS: ScanThresholds = { tallFrac: 0.3, minProminence: 12, waterfallMin: 8 };

export interface Peak {
  x: number;
  h: number;
  prominence: number;
}

export interface ScanResult {
  /** Height of the topmost solidForScan cell per column (0 if none). */
  heights: Int16Array;
  peaks: Peak[];
  /** One entry per registered metric, e.g. trees, tallMountains, shortMountains, waterfalls, water. */
  counts: Record<string, number>;
}

/** What a metric gets besides the world: the silhouette work scan() already did. */
export interface ScanCtx {
  heights: Int16Array;
  peaks: Peak[];
  thresholds: ScanThresholds;
}

/** One number read from the cells. Drop a file into gen/metrics/ that calls registerMetric(). */
export interface Metric {
  name: string;
  label?: string;
  measure(world: World, ctx: ScanCtx): number;
}

export const metrics = new ExtensionRegistry<Metric>('metric', (m) => m.name);

export function registerMetric(name: string, measure: Metric['measure'], label?: string): Metric {
  return metrics.register({ name, measure, label });
}
