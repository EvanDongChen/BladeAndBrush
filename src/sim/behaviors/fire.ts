import { registerBehavior } from '../../core/behaviors';
import { flagOn } from '../../core/config';
import { Flag } from '../../core/constants';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { LEAF } from '../elements/leaf';
import { STEAM } from '../elements/steam';
import { at, FLAMMABILITY, NEIGHBORS4, NEIGHBORS8, REPLACEABLE, RIGID } from '../physics';
import { defineTunables } from '../tunables';
import { rise } from './gas';
import { markUnsupported } from './rigid';

export const fireTunables = defineTunables(
  'fire',
  {
    /** Multiplier on each neighbor's flammability: the ignite chance per neighbor per tick. */
    spread: 0.5,
    /** Average lifetime of a free flame (ticks). */
    flameLife: 22,
    /** Average time a burning cell of wood (TREE) lasts (ticks). */
    burnLife: 70,
    /** Average time a burning leaf lasts (ticks): leaves flash and are gone. */
    leafBurnLife: 16,
    /** Chance that burnt-out wood leaves ASH. */
    ashChance: 0.35,
    /** Chance that a burnt-out leaf leaves ASH (otherwise mostly smoke). */
    leafAshChance: 0.05,
    /** Chance that a dying flame leaves SMOKE. */
    smokeChance: 0.45,
    /** Chance per tick that burning fuel throws a flame into the cell above. */
    emberRate: 0.12,
    /** Chance that water touching fire boils off into steam (the fire always goes out). */
    evaporate: 0.3,
  },
  {
    spread: [0, 2, 0.05],
    flameLife: [4, 120, 1],
    burnLife: [10, 250, 5],
    leafBurnLife: [2, 120, 1],
    ashChance: [0, 1, 0.05],
    leafAshChance: [0, 1, 0.05],
    smokeChance: [0, 1, 0.05],
    emberRate: [0, 1, 0.01],
    evaporate: [0, 1, 0.05],
  },
);

/**
 * FIRE cells use aux for their fuel: 0 = a free flame (rises and flickers), otherwise the element
 * id that is burning (stays put, lasts longer, leaves ash).
 */
function lifetime(world: World, fuel: number): number {
  const base = fuel === 0 ? fireTunables.flameLife : fuel === LEAF ? fireTunables.leafBurnLife : fireTunables.burnLife;
  return Math.max(2, Math.min(255, Math.round(base * world.rng.range(0.6, 1.4))));
}

/**
 * Set (x, y) on fire: a flammable cell becomes burning fuel (its element id kept in aux), anything
 * else becomes a free flame. Used by the fire ability too.
 */
export function ignite(world: World, x: number, y: number): void {
  const i = y * world.w + x;
  const fuel = FLAMMABILITY[world.el[i]] > 0 ? world.el[i] : 0;
  world.set(x, y, El.FIRE, { aux: fuel, life: lifetime(world, fuel) });
  world.flags[i] |= Flag.UPDATED; // starts burning next tick
  if (fuel !== 0 && world.events.has('ignite')) world.events.emit('ignite', { x, y });
}

function burnOut(world: World, x: number, y: number, fuel: number): void {
  const r = world.rng;
  if (fuel !== 0) {
    if (world.events.has('burn')) world.events.emit('burn', { x, y, el: fuel });
    if (RIGID[fuel]) markUnsupported(world); // a burnt trunk drops its canopy
    if (r.chance(fuel === LEAF ? fireTunables.leafAshChance : fireTunables.ashChance)) world.set(x, y, El.ASH, { aux: r.int(256) });
    else if (r.chance(fireTunables.smokeChance)) world.set(x, y, El.SMOKE);
    else world.set(x, y, El.EMPTY);
  } else {
    world.set(x, y, r.chance(fireTunables.smokeChance) ? El.SMOKE : El.EMPTY);
  }
  world.flags[y * world.w + x] |= Flag.UPDATED;
}

function updateFire(world: World, x: number, y: number): void {
  const { w, el, life, aux, rng } = world;
  const i = y * w + x;
  const fuel = aux[i];
  if (life[i] === 0) life[i] = lifetime(world, fuel); // painted fire

  // water puts it out
  for (let k = 0; k < 8; k += 2) {
    const nx = x + NEIGHBORS4[k];
    const ny = y + NEIGHBORS4[k + 1];
    if (at(world, nx, ny) !== El.WATER) continue;
    if (rng.chance(fireTunables.evaporate)) {
      world.set(nx, ny, STEAM);
      world.flags[ny * w + nx] |= Flag.UPDATED;
    }
    world.set(x, y, STEAM);
    world.flags[i] |= Flag.UPDATED;
    return;
  }

  // spread to flammable neighbors
  if (flagOn('fireSpread')) {
    for (let k = 0; k < 16; k += 2) {
      const nx = x + NEIGHBORS8[k];
      const ny = y + NEIGHBORS8[k + 1];
      const f = FLAMMABILITY[at(world, nx, ny)];
      if (f > 0 && rng.chance(f * fireTunables.spread)) ignite(world, nx, ny);
    }
  }

  if (--life[i] === 0) {
    burnOut(world, x, y, fuel);
    return;
  }

  if (fuel !== 0) {
    // burning fuel stays put and throws flames upward
    if (y > 0 && REPLACEABLE[el[i - w]] && rng.chance(fireTunables.emberRate)) {
      world.set(x, y - 1, El.FIRE, { aux: 0, life: lifetime(world, 0) });
      world.flags[i - w] |= Flag.UPDATED;
    }
  } else {
    rise(world, x, y, 0.35); // free flames flicker upward
  }
}

registerBehavior(El.FIRE, updateFire);
