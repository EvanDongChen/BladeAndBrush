import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/** Placeholder level so the level pipeline has one entry. Real levels come with integration. */
registerLevel({
  id: 'demo',
  poem: ['(placeholder poem)'],
  dims: DEFAULT_DIMS,
  seed: 1,
  params: {
    mountainHeight: { value: 0.5 },
    treeDensity: { value: 0.4 },
    gravity: { value: 2, locked: true, visible: false },
  },
  goals: [
    { type: 'metric', metric: 'trees', op: '>=', n: 3 },
    { type: 'metric', metric: 'tallMountains', op: '>=', n: 1 },
  ],
  actionBudget: 5,
});
