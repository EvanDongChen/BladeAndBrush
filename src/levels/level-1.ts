import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/**
 * Level 1, The Peak. One great mountain is always painted at the center; the seed adds lesser
 * ones around it. Cut (or tune) the rest away until a single tall peak stands alone, without
 * slashing through the trees at its foot.
 */
registerLevel({
  id: 'level-1',
  title: 'The Peak',
  poem: ['One peak alone holds up the sky,', 'no lesser hill may share its height;', 'three trees still rest upon its feet.'],
  dims: DEFAULT_DIMS,
  seed: 11,
  params: {
    mountainHeight: { value: 0.55 },
    spacing: { value: 0.35 },
    treeDensity: { value: 0.45 },
    gravity: { value: 2, locked: true, visible: false },
  },
  setpieces: [{ type: 'mountain', x: 0.5, height: 1.5, y: 0.7, halfWidth: 0.1 }],
  goals: [
    { type: 'metric', metric: 'tallMountains', op: '==', n: 1, text: 'Exactly one tall peak' },
    { type: 'metric', metric: 'shortMountains', op: '==', n: 0, text: 'No lesser peaks' },
    { type: 'metric', metric: 'trees', op: '>=', n: 3, text: 'At least three trees' },
  ],
  actionBudget: 6,
});
