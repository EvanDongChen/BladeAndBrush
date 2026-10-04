import { DEFAULT_DIMS } from '../core/constants';
import { registerLevel } from '../core/levels';

/**
 * Level 4, The Trap. Trappers have sealed birds inside the mountains, and a spring sleeps in the
 * rock. Cut the birds free, open the spring (or pour water) into a pond for them, and drive out
 * every trapper, without killing the birds you came for.
 */
registerLevel({
  id: 'level-4',
  title: 'The Trap',
  poem: ['Open the stone and let the caged birds fly,', 'wake the spring to fill a pond for them to drink;', 'and leave no trapper on the land.'],
  dims: DEFAULT_DIMS,
  seed: 44,
  params: {
    mountainHeight: { value: 0.7 },
    spacing: { value: 0.35 },
    treeDensity: { value: 0.35 },
    gravity: { value: 2, locked: true, visible: false },
    wanderers: { value: 0, locked: true, visible: false }, // the only people here are the trappers
  },
  setpieces: [
    { type: 'captives', count: 3, animal: 'bird' },
    { type: 'spring', rate: 0.5, x: 0.2 },
    { type: 'people', count: 2, kind: 'trapper', tags: ['trapper'], x0: 0.04, x1: 0.14, camp: true },
    { type: 'people', count: 1, kind: 'trapper', tags: ['trapper'], x0: 0.86, x1: 0.94, camp: true },
  ],
  goals: [
    { type: 'metric', metric: 'animalsFreed', op: '>=', n: 1, text: 'Free every caged bird' },
    { type: 'metric', metric: 'largestPond', op: '>=', n: 150, text: 'A pond of 150 cells' },
    { type: 'metric', metric: 'people', op: '==', n: 0, text: 'No trappers left' },
  ],
  actionBudget: 9,
});
