import { registerBehavior } from '../../core/behaviors';
import { Flag } from '../../core/constants';
import { El } from '../../core/elements';
import { addStat } from '../../core/objects';
import type { World } from '../../core/world';
import { RAIN } from '../elements/rain';
import { fall, K_LIQUID, KIND } from '../physics';

/**
 * Falls straight down through air and gas. Where it lands it becomes WATER, and the first solid
 * thing under it (through any puddle it lands in) gets stats.rain += 1 on its tracked object.
 */
function updateRain(world: World, x: number, y: number): void {
  if (fall(world, x, y)) return;
  const { w, h, el, obj } = world;
  let below = y + 1;
  while (below < h && KIND[el[below * w + x]] === K_LIQUID) below++;
  if (below < h) addStat(world, obj[below * w + x], 'rain');
  world.set(x, y, El.WATER);
  world.flags[y * w + x] |= Flag.UPDATED;
}

registerBehavior(RAIN, updateRain);
