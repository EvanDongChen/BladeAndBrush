import type { World } from '../../core/world';
import { gravityOf, windOf } from '../physics';
import { PERSON } from '../elements/person';
import {
  canPose,
  creatureTunables,
  defineCreature,
  flee,
  groundedAt,
  relocate,
  scanFire,
  type Creature,
  type CreatureDef,
  type Pixel,
} from '../creatures';

// part ids
const HAT = 0;
const BRIM = 1;
const SKIN = 2;
const LEG = 3;
const STAFF = 4;
const ROBE = 99; // palette index depends on the variant

/** Everything above the legs, facing right. The anchor [0, 0] is the bottom of the robe. */
const BODY: Pixel[] = [
  [0, -7, HAT],
  [-1, -6, HAT],
  [0, -6, HAT],
  [1, -6, HAT],
  [-3, -5, BRIM],
  [-2, -5, BRIM],
  [-1, -5, BRIM],
  [0, -5, BRIM],
  [1, -5, BRIM],
  [2, -5, BRIM],
  [3, -5, BRIM],
  [0, -4, SKIN],
  [-1, -3, ROBE],
  [0, -3, ROBE],
  [1, -3, ROBE],
  [-1, -2, ROBE],
  [0, -2, ROBE],
  [1, -2, ROBE],
  [-1, -1, ROBE],
  [0, -1, ROBE],
  [1, -1, ROBE],
  [-1, 0, ROBE],
  [0, 0, ROBE],
  [1, 0, ROBE],
  [2, -4, STAFF], // a walking staff in the front hand
  [2, -3, STAFF],
  [2, -2, STAFF],
  [2, -1, STAFF],
  [2, 0, STAFF],
  [2, 1, STAFF],
];
const STRIDE: Pixel[] = [...BODY, [-1, 1, LEG], [1, 1, LEG]];
const TOGETHER: Pixel[] = [...BODY, [0, 1, LEG]];
const IDLE = 2;

/** Wind above the default breeze starts to shove villagers. */
const BREEZE = 0.35;

/**
 * Fall: one cell per tick at the default gravity, faster when gravity is turned up. At zero
 * gravity villagers float slowly up; below zero they fly up, faster the lower it goes.
 */
function fallPerson(world: World, def: CreatureDef, c: Creature): void {
  const g = gravityOf(world);
  if (g > 0) {
    const steps = Math.max(1, Math.round(g / 2));
    for (let k = 0; k < steps; k++) {
      if (groundedAt(world, def, c.x, c.y, c.frame, c.face) || !relocate(world, def, c, 0, 1)) break;
    }
  } else if (g < 0) {
    const steps = Math.max(1, Math.round(-g / 2));
    for (let k = 0; k < steps; k++) if (!relocate(world, def, c, 0, -1)) break;
  } else if (world.tick % 3 === 0) {
    relocate(world, def, c, 0, -1);
  }
  blow(world, def, c, true);
}

/**
 * The wind shoves villagers downwind: up to a cell a tick in a gale, faster in the air than on
 * the ground. On the ground they are pushed up small steps, and a gale now and then lifts them
 * off their feet.
 */
function blow(world: World, def: CreatureDef, c: Creature, airborne: boolean): void {
  const wind = windOf(world);
  const gust = Math.abs(wind) - BREEZE;
  if (gust <= 0) return;
  const dx = wind > 0 ? 1 : -1;
  const every = Math.max(1, Math.round((airborne ? 4 : 7) * (1 - gust / (1 - BREEZE))));
  if (world.tick % every !== 0) return;
  if (relocate(world, def, c, dx, 0)) {
    if (!airborne && gust > 0.4 && world.tick % 5 === 0) relocate(world, def, c, 0, -1); // swept off their feet
    return;
  }
  if (!airborne) relocate(world, def, c, dx, -1); // shoved up a step
}

/**
 * Stroll: walk a while, stand a while, now and then turn around. Falls when the ground goes,
 * steps up small steps and down short drops, turns back at cliffs and walls, and runs away from
 * nearby fire. life = (running ? 128 : 0) | timer (ticks left in the current walk or pause).
 */
function think(world: World, c: Creature, def: CreatureDef): void {
  if (gravityOf(world) <= 0 || !groundedAt(world, def, c.x, c.y, c.frame, c.face)) {
    fallPerson(world, def, c);
    return;
  }
  blow(world, def, c, false);
  const t = creatureTunables;
  const { rng } = world;
  let panic = (c.life & 128) !== 0;
  let timer = c.life & 127;
  const phase = world.tick + c.variant * 5;

  if (phase % 5 === 0 && scanFire(world, c.x, c.y, t.fleeRadius)) {
    const away = flee.x < 0 ? -1 : flee.x > 0 ? 1 : c.face;
    relocate(world, def, c, 0, 0, c.frame === IDLE ? 0 : c.frame, away);
    panic = true;
    timer = 24;
  }

  if (timer > 0) timer--;
  else {
    panic = false;
    if (c.frame === IDLE) {
      relocate(world, def, c, 0, 0, 0, rng.chance(0.4) ? -c.face : c.face); // set off, maybe the other way
      timer = 40 + rng.int(80);
    } else {
      relocate(world, def, c, 0, 0, IDLE, c.face);
      timer = 30 + rng.int(90);
    }
  }
  c.life = (panic ? 128 : 0) | timer;

  if (c.frame === IDLE || phase % (panic ? t.personRun : t.personStep) !== 0) return;
  if (!step(world, c, def) && !panic) relocate(world, def, c, 0, 0, c.frame, -c.face); // blocked: turn around
}

/** One step forward, alternating legs: along the ground, up a low step or slope, or down a short drop. */
function step(world: World, c: Creature, def: CreatureDef): boolean {
  const dx = c.face;
  const next = c.frame ^ 1;
  if (canPose(world, def, c, dx, 0, next, dx, false)) {
    if (groundedAt(world, def, c.x + dx, c.y, next, dx)) return relocate(world, def, c, dx, 0, next);
    for (let drop = 1; drop <= 3; drop++) {
      if (canPose(world, def, c, dx, drop, next, dx, true)) return relocate(world, def, c, dx, drop, next);
    }
    return false; // a cliff
  }
  for (let up = 1; up <= 2; up++) {
    if (canPose(world, def, c, dx, -up, next, dx, true)) return relocate(world, def, c, dx, -up, next);
  }
  return false; // a wall
}

export const PERSON_DEF = defineCreature({
  el: PERSON,
  frames: [STRIDE, TOGETHER, STRIDE],
  variants: 6,
  paint: (part, variant) => (part === ROBE ? 5 + variant : part),
  think,
  spawnSpacing: 16,
});
