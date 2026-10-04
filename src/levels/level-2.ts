import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/**
 * Level 2, The Eclipse. A full moon hangs over the middle of the scroll between two guardian
 * peaks. Tune the painting until those two are the only tall peaks (one each side of the moon) and
 * the forest is thin, then cleave the moon and burn what trees remain.
 */
registerLevel({
  id: 'level-2',
  title: 'The Eclipse',
  poem: ['Cleave the moon above the pass,', 'one peak to guard it on each side;', 'let fire take the forest.'],
  tip: 'Spread the mountains out until only the two guardians stand tall (red marks), thin the forest, then cut the moon and burn the trees that are left.',
  dims: DEFAULT_DIMS,
  seed: 22,
  params: {
    spacing: { value: 0.3, label: 'Space between mountains' },
    mountainHeight: { value: 0.6, label: 'Mountain height', min: 0.4, max: 0.8 },
    treeDensity: { value: 0.35, label: 'Forest', min: 0.12, max: 0.5 },
    gravity: { value: 2, locked: true, visible: false },
  },
  setpieces: [
    { type: 'moon', x: 0.5, y: 0.2, r: 0.075, clear: 0.09 },
    { type: 'mountain', x: 0.27, height: 1.8, y: 0.72 },
    { type: 'mountain', x: 0.73, height: 1.8, y: 0.72 },
  ],
  goals: [
    { type: 'metric', metric: 'moonBroken', op: '>=', n: 1, text: 'Break the moon' },
    {
      type: 'all',
      text: 'Two tall peaks, one each side of the moon',
      of: [
        { type: 'metric', metric: 'tallMountains', op: '==', n: 2 },
        { type: 'metric', metric: 'tallLeftOfMoon', op: '==', n: 1 },
        { type: 'metric', metric: 'tallRightOfMoon', op: '==', n: 1 },
      ],
    },
    { type: 'metric', metric: 'trees', op: '<=', n: 15, text: 'Fifteen trees or fewer' },
  ],
  actionBudget: 8,
});
