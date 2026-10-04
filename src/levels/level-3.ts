import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/**
 * Level 3, The Drought. A village of wooden huts waits on the dry plain. Cut a groove down a slope
 * and pour water into it for a waterfall; bring fire and water together so the steam comes back
 * down as rain on the village; and lose no one to the fire or the blade.
 */
registerLevel({
  id: 'level-3',
  title: 'The Drought',
  poem: ['Lead the water down the stone,', 'let fire meet it and fall as rain upon the roofs;', 'and spare every villager.'],
  dims: DEFAULT_DIMS,
  seed: 33,
  params: {
    mountainHeight: { value: 0.6 },
    spacing: { value: 0.4 },
    treeDensity: { value: 0.4 },
    gravity: { value: 2, locked: true, visible: false },
  },
  setpieces: [
    { type: 'village', x0: 0.64, x1: 0.94, huts: 3, trees: 2, people: 5 },
    { type: 'cloud', x: 0.79, y: 0.56, w: 0.13, h: 0.03 }, // the dry cloud over the village, waiting for steam
  ],
  goals: [
    { type: 'metric', metric: 'waterfalls', op: '>=', n: 1, text: 'A waterfall' },
    { type: 'metric', metric: 'villageRain', op: '>=', n: 20, text: 'Rain on the village' },
    {
      type: 'all',
      text: 'Every villager alive',
      of: [
        { type: 'metric', metric: 'villagersLost', op: '==', n: 0 },
        { type: 'metric', metric: 'villagers', op: '>=', n: 1 },
      ],
    },
  ],
  actionBudget: 6,
});
