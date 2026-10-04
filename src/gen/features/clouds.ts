import { registerFeature } from '../../core/features';
import { registerParam } from '../../core/params';
import { addCloud } from '../cloudKit';
import { hintsOf } from '../plan';

registerParam({ key: 'cloudiness', label: 'Clouds', min: 0, max: 1, step: 0.01, default: 0.4 });

/**
 * Clouds in the upper sky, more of them with the Clouds slider: soft puffs the sim grows and the
 * wind carries across the scroll (sim/behaviors/cloud.ts). They start out of the stretches a level
 * keeps clear (under the moon, over a village; a level can hang its own with the 'cloud' setpiece).
 * Steam that rises into one soaks it and it rains.
 */
registerFeature({
  name: 'clouds',
  label: 'Clouds',
  order: 22,
  run: ({ bp, dims, params, rng, newStroke }) => {
    const amount = Math.max(0, Math.min(1, params.cloudiness ?? 0));
    const count = Math.round(amount * 7);
    const clear = hintsOf(bp)?.clear ?? [];
    const scale = dims.h / 256;
    for (let k = 0; k < count; k++) {
      const halfW = rng.range(22, 55) * scale;
      const halfH = rng.range(5, 9) * scale;
      const cx = dims.w * ((k + rng.range(0.15, 0.85)) / count);
      const cy = dims.h * rng.range(0.07, 0.3);
      if (clear.some(([a, b]) => cx + halfW > a * dims.w && cx - halfW < b * dims.w)) continue;
      addCloud(newStroke, cx, cy, halfW, halfH);
    }
  },
});
