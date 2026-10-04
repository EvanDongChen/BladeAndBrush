import { registerBehavior } from '../../core/behaviors';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { CLOUD } from '../elements/cloud';
import { at, BLOCKED, canSink, fall, moveCell, REPLACEABLE, slideDiagonal } from '../physics';
import { dropThroughCloud } from './cloud';
import { defineTunables } from '../tunables';

export const waterTunables = defineTunables(
  'water',
  {
    /** Max cells a water cell flows sideways per tick. Higher levels out faster. */
    dispersion: 5,
  },
  { dispersion: [1, 12, 1] },
);

/**
 * Fall, else slide diagonally down, else flow sideways. The flow direction is kept in vx so a
 * stream keeps going one way instead of jittering. Sideways flow stops above a gap, so water
 * drops into grooves on its own.
 */
export function updateWater(world: World, x: number, y: number): void {
  if (fall(world, x, y)) return;
  if (at(world, x, y + 1) === CLOUD && world.inBounds(x, y + 1) && dropThroughCloud(world, x, y)) return; // water falls through clouds
  if (slideDiagonal(world, x, y)) return;

  const i = y * world.w + x;
  let dir = world.vx[i];
  if (dir === 0) dir = world.rng.chance(0.5) ? 1 : -1;

  const reach = waterTunables.dispersion | 0;
  let dist = 0;
  for (let k = 1; k <= reach; k++) {
    const nx = x + dir * k;
    if (!REPLACEABLE[at(world, nx, y)]) break;
    dist = k;
    if (canSink(El.WATER, at(world, nx, y + 1)) !== BLOCKED) break; // fall in here next tick
  }
  if (dist === 0) {
    world.vx[i] = -dir; // blocked: try the other way next tick
    return;
  }
  const j = moveCell(world, x, y, x + dir * dist, y, 1);
  world.vx[j] = dir;
}

registerBehavior(El.WATER, updateWater);
