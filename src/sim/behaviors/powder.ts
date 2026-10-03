import { registerBehavior } from '../../core/behaviors';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { EARTH } from '../elements/earth';
import { fall, slideDiagonal } from '../physics';
import { defineTunables } from '../tunables';

export const powderTunables = defineTunables(
  'powder',
  {
    /** Chance per tick that a resting grain slides down a diagonal (lower = steeper piles). */
    slide: 0.9,
  },
  { slide: [0, 1, 0.05] },
);

/** Falls with gravity, then slides diagonally into piles. Sinks through water. */
export function updatePowder(world: World, x: number, y: number): void {
  if (fall(world, x, y)) return;
  if (world.rng.chance(powderTunables.slide)) slideDiagonal(world, x, y);
}

registerBehavior(El.ASH, updatePowder);
registerBehavior(EARTH, updatePowder);
