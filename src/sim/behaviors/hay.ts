import { registerBehavior } from '../../core/behaviors';
import type { World } from '../../core/world';
import { HAY } from '../elements/hay';
import { fall, slideDiagonal } from '../physics';
import { defineTunables } from '../tunables';

export const hayTunables = defineTunables(
  'hay',
  {
    /** Chance per tick that a resting wisp slides down a diagonal. Low = steep, fluffy stacks. */
    slide: 0.3,
  },
  { slide: [0, 1, 0.05] },
);

/** Falls like any powder, but straw tangles: it only slides off a slope now and then. */
function updateHay(world: World, x: number, y: number): void {
  if (fall(world, x, y)) return;
  if (world.rng.chance(hayTunables.slide)) slideDiagonal(world, x, y);
}

registerBehavior(HAY, updateHay);
