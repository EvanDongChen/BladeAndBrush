import { registerMetric } from '../../core/scan';

/** Peaks (already filtered by minProminence) split into tall/short by tallFrac of the grid height. */
registerMetric(
  'tallMountains',
  (world, { peaks, thresholds }) => peaks.filter((p) => p.h >= thresholds.tallFrac * world.h).length,
  'Tall mountains',
);

registerMetric(
  'shortMountains',
  (world, { peaks, thresholds }) => peaks.filter((p) => p.h < thresholds.tallFrac * world.h).length,
  'Short mountains',
);

/**
 * How close the second-highest peak comes to the highest: its height over the highest one's (0 with
 * one peak or none). "No lesser hill shares its height" is peakRivalry <= 0.5.
 */
registerMetric(
  'peakRivalry',
  (_world, { peaks }) => {
    if (peaks.length < 2) return 0;
    const hs = peaks.map((p) => p.h).sort((a, b) => b - a);
    return hs[0] > 0 ? Math.round((hs[1] / hs[0]) * 100) / 100 : 0;
  },
  'Second peak / highest',
);
