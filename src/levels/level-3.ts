import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/**
 * Level 3, The Drought. A village of wooden huts waits on the dry plain beside a mountain, under a
 * dry cloud the wind carries along. Cut a groove down the mountain and pour water into it for a
 * waterfall; bring fire and water together so the steam rises into the cloud and it rains on the
 * village; and lose no one to the fire or the blade.
 */
registerLevel({
  id: 'level-3',
  title: 'The Drought',
  poem: ['Lead the water down the stone,', 'let fire meet it, and the cloud bring rain upon the roofs;', 'and spare every villager.'],
  tip: 'Steam from fire meeting water rises into the cloud and it rains. The wind carries the cloud: tune the wind to keep it over the village.',
  dims: DEFAULT_DIMS,
  seed: 33,
  params: {
    wind: { value: 0.1, label: 'Wind', min: -0.5, max: 0.5 },
    mountainHeight: { value: 0.6, label: 'Mountain height' }, // shaped with the mountain graph
    spacing: { value: 0.4, label: 'Space between mountains' },
    treeDensity: { value: 0.4, visible: false },
    gravity: { value: 2, locked: true, visible: false },
  },
  setpieces: [
    { type: 'village', x0: 0.71, x1: 0.87, huts: 3, trees: 2, people: 4 },
    { type: 'mountain', x: 0.62, height: 1.2, y: 0.8, halfWidth: 0.05 }, // beside the village: water and steam start here
    { type: 'cloud', x: 0.79, y: 0.56, w: 0.1, h: 0.035 }, // the dry cloud over the village, waiting for steam
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
