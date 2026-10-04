import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/**
 * Level 2, The Eclipse. A full moon hangs over the middle of the scroll, between two great peaks.
 * Break the moon with the blade, keep exactly one tall peak on each side of it, and burn every
 * tree away. Tree density is locked, so the trees have to go by fire.
 */
registerLevel({
  id: 'level-2',
  title: 'The Eclipse',
  poem: ['Cleave the moon above the pass,', 'one peak to guard it on each side;', 'let fire take every tree.'],
  dims: DEFAULT_DIMS,
  seed: 22,
  params: {
    mountainHeight: { value: 0.6 },
    spacing: { value: 0.3 },
    treeDensity: { value: 0.2, locked: true },
    gravity: { value: 2, locked: true, visible: false },
  },
  setpieces: [
    { type: 'moon', x: 0.5, y: 0.2, r: 0.075, clear: 0.09 },
    { type: 'mountain', x: 0.27, height: 1.3, y: 0.72 },
    { type: 'mountain', x: 0.73, height: 1.3, y: 0.72 },
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
    { type: 'metric', metric: 'trees', op: '==', n: 0, text: 'No trees left' },
  ],
  actionBudget: 8,
});
