import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/** Placeholder level 4 of 4. Poem, goals and params are temporary. */
registerLevel({
  id: 'level-4',
  poem: ['(placeholder poem 4)'],
  dims: DEFAULT_DIMS,
  seed: 4,
  params: {
    mountainHeight: { value: 0.7 },
    treeDensity: { value: 0.4 },
    gravity: { value: 2, locked: true, visible: false },
  },
  goals: [
    { type: 'metric', metric: 'trees', op: '>=', n: 4 },
    { type: 'metric', metric: 'tallMountains', op: '>=', n: 2 },
  ],
  actionBudget: 8,
});
