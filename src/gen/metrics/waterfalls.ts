import { El } from '../../core/elements';
import { registerMetric } from '../../core/scan';
import { countComponents } from '../scan';

/** Vertical WATER runs of at least waterfallMin cells; side-by-side runs count as one waterfall. */
registerMetric(
  'waterfalls',
  (world, { thresholds }) => {
    const { w, h, el } = world;
    const mask = new Uint8Array(world.size);
    for (let x = 0; x < w; x++) {
      let runStart = -1;
      for (let y = 0; y <= h; y++) {
        const isWater = y < h && el[y * w + x] === El.WATER;
        if (isWater && runStart < 0) runStart = y;
        if (!isWater && runStart >= 0) {
          if (y - runStart >= thresholds.waterfallMin) for (let k = runStart; k < y; k++) mask[k * w + x] = 1;
          runStart = -1;
        }
      }
    }
    return countComponents(w, h, mask);
  },
  'Waterfalls',
);
