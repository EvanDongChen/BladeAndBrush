import { registerFeature } from '../../core/features';
import { registerParam } from '../../core/params';
import { paintCloud } from '../paint/cloud';
import { hintsOf } from '../plan';

registerParam({ key: 'cloudiness', label: 'Clouds', min: 0, max: 1, step: 0.01, default: 0.4 });

/**
 * Clouds drifting across the upper sky: long white bands with scalloped tops, more of them with the
 * Clouds slider. They keep out of the stretches a level keeps clear (under the moon, over a village;
 * a level can hang its own with the 'cloud' setpiece). Steam that rises into one soaks it and it
 * rains (sim/behaviors/cloud.ts).
 */
registerFeature({
  name: 'clouds',
  label: 'Clouds',
  order: 22, // after the trees, before the moon (25), which only fills sky the clouds left
  run: ({ bp, dims, params, rng, noise, newStroke }) => {
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
      paintCloud(bp, newStroke, rng, noise, cx, cy, halfW, halfH);
    }
  },
});
