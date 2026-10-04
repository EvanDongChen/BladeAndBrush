import { El } from '../../core/elements';
import { registerMetric } from '../../core/scan';
import { countComponents } from '../scan';

/** Water wider than this (cells, along a row) is a pool there, not a falling stream. */
const MAX_WIDTH = 6;

/**
 * Vertical WATER runs of at least waterfallMin cells, made only of narrow water (at most MAX_WIDTH
 * across at each row), so a stream down a groove or over a ledge counts but a pond or a flood does
 * not. Side-by-side runs count as one waterfall.
 */
registerMetric(
  'waterfalls',
  (world, { thresholds }) => {
    const { w, h, el } = world;
    // narrow[i] = 1 where the water at i belongs to a row run of at most MAX_WIDTH cells
    const narrow = new Uint8Array(world.size);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let x = 0;
      while (x < w) {
        if (el[row + x] !== El.WATER) {
          x++;
          continue;
        }
        let end = x;
        while (end < w && el[row + end] === El.WATER) end++;
        if (end - x <= MAX_WIDTH) narrow.fill(1, row + x, row + end);
        x = end;
      }
    }
    const mask = new Uint8Array(world.size);
    for (let x = 0; x < w; x++) {
      let runStart = -1;
      for (let y = 0; y <= h; y++) {
        const isFall = y < h && narrow[y * w + x] === 1;
        if (isFall && runStart < 0) runStart = y;
        if (!isFall && runStart >= 0) {
          if (y - runStart >= thresholds.waterfallMin) for (let k = runStart; k < y; k++) mask[k * w + x] = 1;
          runStart = -1;
        }
      }
    }
    return countComponents(w, h, mask);
  },
  'Waterfalls',
);
