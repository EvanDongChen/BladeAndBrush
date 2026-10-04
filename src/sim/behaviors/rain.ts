import { registerBehavior } from '../../core/behaviors';
import { Flag } from '../../core/constants';
import { El } from '../../core/elements';
import { addStat } from '../../core/objects';
import type { World } from '../../core/world';
import { RAIN } from '../elements/rain';
import { at, fall, FREE, K_LIQUID, KIND, moveCell, REPLACEABLE, windOf } from '../physics';

/**
 * Falls through air and gas, slanting with the wind. Where it lands it becomes WATER, and the first solid
 * thing under it (through any puddle it lands in) gets stats.rain += 1 on its tracked object.
 */
function updateRain(world: World, x: number, y: number): void {
  const wind = windOf(world);
  if (wind !== 0 && world.rng.chance(Math.abs(wind) * 0.5)) {
    // blown sideways: the drop slants with the wind
    const dx = wind > 0 ? 1 : -1;
    if (REPLACEABLE[at(world, x + dx, y + 1)]) {
      moveCell(world, x, y, x + dx, y + 1, FREE);
      return;
    }
  }
  if (fall(world, x, y)) return;
  const { w, h, el, obj } = world;
  let below = y + 1;
  while (below < h && KIND[el[below * w + x]] === K_LIQUID) below++;
  if (below < h) addStat(world, obj[below * w + x], 'rain');
  world.set(x, y, El.WATER);
  world.flags[y * w + x] |= Flag.UPDATED;
}

registerBehavior(RAIN, updateRain);
