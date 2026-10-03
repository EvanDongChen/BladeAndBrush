import type { World } from '../../core/world';
import { BUTTERFLY } from '../elements/butterfly';
import { creatureTunables, defineCreature, flee, relocate, scanFire, type Creature, type CreatureDef, type Pixel } from '../creatures';
import { K_LIQUID, K_POWDER, K_STATIC, KIND, at } from '../physics';

const BODY = 0;
const WING = 1;

const OPEN: Pixel[] = [
  [0, 0, BODY],
  [-1, 0, WING],
  [1, 0, WING],
  [-1, -1, WING],
  [1, -1, WING],
];
const CLOSED: Pixel[] = [
  [0, 0, BODY],
  [-1, 0, WING],
  [1, 0, WING],
];

/** The 8 headings as [dx, dy] pairs: E, NE, N, NW, W, SW, S, SE (y grows downward). */
const DIRS = [1, 0, 1, -1, 0, -1, -1, -1, -1, 0, -1, 1, 0, 1, 1, 1];
/** Heading index for a (dx, dy) of -1/0/1, indexed (dy + 1) * 3 + (dx + 1). */
const DIR_OF = [3, 2, 1, 4, 0, 0, 5, 6, 7];

/** The heading closest to a vector, using only comparisons so it is identical everywhere. */
export function headingOf(fx: number, fy: number): number {
  const ax = Math.abs(fx);
  const ay = Math.abs(fy);
  const sx = fx > 0 ? 1 : fx < 0 ? -1 : 0;
  const sy = fy > 0 ? 1 : fy < 0 ? -1 : 0;
  let dx = ax * 2.4 < ay ? 0 : sx;
  const dy = ay * 2.4 < ax ? 0 : sy;
  if (dx === 0 && dy === 0) dx = 1;
  return DIR_OF[(dy + 1) * 3 + (dx + 1)];
}

/** Is there ground or water within `reach` cells below? */
function nearGround(world: World, x: number, y: number, reach: number): boolean {
  for (let k = 1; k <= reach; k++) {
    const kind = KIND[at(world, x, y + k)];
    if (kind === K_STATIC || kind === K_POWDER || kind === K_LIQUID) return true;
  }
  return false;
}

/**
 * Flutter: wings flap every few ticks, and every few ticks it drifts one cell along a heading that
 * wanders a little each time. life = timer << 3 | heading. It turns away from walls and ground,
 * keeps off the ceiling, and flees nearby fire.
 */
function think(world: World, c: Creature, def: CreatureDef): void {
  const t = creatureTunables;
  const { rng } = world;
  let dir = c.life & 7;
  let timer = c.life >> 3;
  const phase = world.tick + c.variant * 5;

  if (phase % 4 === 0 && scanFire(world, c.x, c.y, t.fleeRadius)) {
    dir = headingOf(flee.x, flee.y);
    timer = 10;
  }

  const flap = ((phase / 3) | 0) & 1;
  if (phase % t.butterflyEvery === 0) {
    if (timer > 0) timer--;
    else {
      dir = (dir + rng.int(3) + 7) & 7; // turn -1, 0 or +1
      if (rng.chance(0.12)) dir = rng.int(8);
      timer = 3 + rng.int(10);
    }
    const dx = DIRS[dir * 2];
    let dy = DIRS[dir * 2 + 1];
    if (c.y < 8) dy = Math.abs(dy); // not through the ceiling
    else if (dy > 0 && nearGround(world, c.x, c.y, 5)) dy = -dy; // not into the ground
    if (!relocate(world, def, c, dx, dy, flap)) {
      dir = (dir + 3 + rng.int(3)) & 7; // bumped into something: turn around
      timer = 3;
      if (flap !== c.frame) relocate(world, def, c, 0, 0, flap);
    }
  } else if (flap !== c.frame) {
    relocate(world, def, c, 0, 0, flap);
  }
  c.life = (timer << 3) | dir;
}

export const BUTTERFLY_DEF = defineCreature({
  el: BUTTERFLY,
  frames: [OPEN, CLOSED],
  variants: 6,
  paint: (part, variant) => (part === BODY ? 0 : 1 + variant),
  think,
  spawnSpacing: 10,
});
