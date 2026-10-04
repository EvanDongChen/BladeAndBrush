import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/** Placeholder level 1 of 4. Poem, goals and params are temporary. */
registerLevel({
  id: 'level-1',
  poem: ['(placeholder poem 1)'],
  dims: DEFAULT_DIMS,
  seed: 1,
  params: {
    mountainHeight: { value: 0.5 },
    treeDensity: { value: 0.4 },
    gravity: { value: 2, locked: true, visible: false },
  },
  goals: [
    { type: 'metric', metric: 'trees', op: '>=', n: 3 },
  ],
  actionBudget: 5,
});
