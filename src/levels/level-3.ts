import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/** Placeholder level 3 of 4. Poem, goals and params are temporary. */
registerLevel({
  id: 'level-3',
  poem: ['(placeholder poem 3)'],
  dims: DEFAULT_DIMS,
  seed: 3,
  params: {
    mountainHeight: { value: 0.5 },
    treeDensity: { value: 0.5 },
    gravity: { value: 2, locked: true, visible: false },
  },
  goals: [
    { type: 'metric', metric: 'trees', op: '>=', n: 5 },
    { type: 'metric', metric: 'tallMountains', op: '>=', n: 1 },
  ],
  actionBudget: 6,
});
