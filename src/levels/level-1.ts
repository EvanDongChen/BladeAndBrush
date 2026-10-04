import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/**
 * Level 1, The Peak. One great mountain, circled by birds, is always painted at the center; the
 * seed adds lesser ones around it. Tune the painting (lower and spread the mountains) until The
 * Peak stands alone, then cut down whatever still rivals it, sparing the trees.
 */
registerLevel({
  id: 'level-1',
  title: 'The Peak',
  poem: ['One peak alone holds up the sky,', 'no lesser hill may reach half its height;', 'three trees still rest upon its feet.'],
  tip: 'The Peak is the one the birds circle. Lower and spread out the other mountains, then cut down what still rivals it. Red marks are tall peaks, rings are lesser ones.',
  dims: DEFAULT_DIMS,
  seed: 11,
  params: {
    mountainHeight: { value: 0.65, label: 'Mountain height', min: 0.3, max: 0.8 },
    spacing: { value: 0.2, label: 'Space between mountains' },
    treeDensity: { value: 0.45, visible: false },
    gravity: { value: 2, locked: true, visible: false },
  },
  setpieces: [
    { type: 'mountain', x: 0.5, height: 2.2, y: 0.7, halfWidth: 0.1 },
    { type: 'flock', x: 0.5, count: 4, circle: true },
  ],
  goals: [
    { type: 'metric', metric: 'tallMountains', op: '==', n: 1, text: 'Exactly one tall peak' },
    { type: 'metric', metric: 'peakRivalry', op: '<=', n: 0.5, text: 'No other hill half as high' },
    { type: 'metric', metric: 'trees', op: '>=', n: 3, text: 'At least three trees' },
  ],
  actionBudget: 6,
});
