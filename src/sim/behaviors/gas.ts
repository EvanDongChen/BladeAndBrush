import { registerBehavior } from '../../core/behaviors';
import { Flag } from '../../core/constants';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { DUST } from '../elements/dust';
import { STEAM } from '../elements/steam';
import { at, BLOCKED, canRise, FREE, moveCell, REPLACEABLE } from '../physics';
import { defineTunables } from '../tunables';

export const gasTunables = defineTunables(
  'gas',
  {
    /** Average smoke lifetime in ticks. */
    smokeLife: 110,
    /** Average steam lifetime in ticks. */
    steamLife: 70,
    /** Chance that expiring steam condenses back into a water drop. */
    condense: 0.25,
    /** Chance per tick to drift sideways instead of rising. */
    drift: 0.3,
    /** Average dust lifetime in ticks. */
    dustLife: 26,
  },
  { smokeLife: [10, 250, 5], steamLife: [10, 250, 5], condense: [0, 1, 0.05], drift: [0, 1, 0.05], dustLife: [4, 120, 2] },
);

/** life 0 means "not started yet" (e.g. painted), so it gets a randomized lifetime first. */
function startLife(world: World, base: number): number {
  return Math.max(2, Math.min(255, Math.round(base * world.rng.range(0.6, 1.4))));
}

/** Rise through empty space and heavier fluids, drifting sideways a little. */
export function rise(world: World, x: number, y: number, drift: number): void {
  const me = world.el[y * world.w + x];
  if (world.rng.chance(drift)) {
    const dx = world.rng.chance(0.5) ? 1 : -1;
    if (REPLACEABLE[at(world, x + dx, y)]) {
      moveCell(world, x, y, x + dx, y, FREE);
      return;
    }
  }
  const up = canRise(me, at(world, x, y - 1));
  if (up !== BLOCKED) {
    moveCell(world, x, y, x, y - 1, up);
    return;
  }
  const first = world.rng.chance(0.5) ? 1 : -1;
  for (let s = 0; s < 2; s++) {
    const dx = s === 0 ? first : -first;
    const m = canRise(me, at(world, x + dx, y - 1));
    if (m !== BLOCKED) {
      moveCell(world, x, y, x + dx, y - 1, m);
      return;
    }
  }
}

function updateGas(world: World, x: number, y: number): void {
  const i = y * world.w + x;
  const me = world.el[i];
  if (world.life[i] === 0) {
    world.life[i] = startLife(world, me === STEAM ? gasTunables.steamLife : me === DUST ? gasTunables.dustLife : gasTunables.smokeLife);
  } else if (--world.life[i] === 0) {
    if (me === STEAM && world.rng.chance(gasTunables.condense)) world.set(x, y, El.WATER);
    else world.set(x, y, El.EMPTY);
    world.flags[i] |= Flag.UPDATED;
    return;
  }
  rise(world, x, y, me === DUST ? 0.7 : gasTunables.drift); // dust mostly spreads sideways
}

/** Kick up `count` dust puffs in free cells within `radius` of (x, y). */
export function spawnDust(world: World, x: number, y: number, count: number, radius: number): void {
  const { rng, el, w } = world;
  for (let k = 0; k < count; k++) {
    const px = Math.round(x + rng.range(-radius, radius));
    const py = Math.round(y + rng.range(-radius, radius * 0.4));
    if (!world.inBounds(px, py) || !REPLACEABLE[el[py * w + px]]) continue;
    world.set(px, py, DUST, { aux: rng.int(256), life: startLife(world, gasTunables.dustLife) });
  }
}

registerBehavior(El.SMOKE, updateGas);
registerBehavior(STEAM, updateGas);
registerBehavior(DUST, updateGas);
