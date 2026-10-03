import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/** Placeholder level 2 of 4. Poem, goals and params are temporary. */
registerLevel({
  id: 'level-2',
  poem: ['(placeholder poem 2)'],
  dims: DEFAULT_DIMS,
  seed: 2,
  params: {
    mountainHeight: { value: 0.6 },
    treeDensity: { value: 0.3 },
    gravity: { value: 2, locked: true, visible: false },
  },
  goals: [
    { type: 'metric', metric: 'tallMountains', op: '>=', n: 2 },
  ],
  actionBudget: 5,
});
