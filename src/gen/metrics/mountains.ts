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
