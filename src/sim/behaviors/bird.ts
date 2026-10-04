import type { World } from '../../core/world';
import { BIRD } from '../elements/bird';
import { creatureTunables, defineCreature, EDGE_MARGIN, flee, nudge, relocate, scanFire, type Creature, type CreatureDef, type Pixel } from '../creatures';
import { BREEZE, gravityOf, windOf, windYOf } from '../physics';

// A shallow V of wings around the body, in three poses (all facing right; it is symmetric).
const GLIDE: Pixel[] = [
  [0, 0, 0],
  [-1, 0, 0],
  [1, 0, 0],
  [-2, -1, 0],
  [2, -1, 0],
];
const DOWN: Pixel[] = [
  [0, 0, 0],
  [-1, 0, 0],
  [1, 0, 0],
  [-2, 1, 0],
  [2, 1, 0],
];
const UP: Pixel[] = [
  [0, 0, 0],
  [-1, -1, 0],
  [1, -1, 0],
  [-2, -2, 0],
  [2, -2, 0],
];

/** How far (cells) a circling bird strays from its home before it turns back. */
const CIRCLE_RADIUS = 36;

/** Flap cycle over the three poses: glide, up, glide, down. */
const CYCLE = [0, 2, 0, 1];

/**
 * Fly: always moving forward, with the wings cycling. Now and then it picks a new gentle climb or
 * dive (life = timer << 2 | 0 level / 1 up / 2 down), stays between the ceiling and the lower sky,
 * climbs over low obstacles, turns around at walls and short of the canvas edge, and flies up and away
 * from nearby fire.
 */
function think(world: World, c: Creature, def: CreatureDef): void {
  const t = creatureTunables;
  const { rng } = world;
  let vdir = c.life & 3;
  let timer = c.life >> 2;
  let face = c.face;
  const phase = world.tick + c.variant * 3;
  const frame = CYCLE[((phase / 5) | 0) & 3];

  if (phase % 5 === 0 && scanFire(world, c.x, c.y, t.fleeRadius)) {
    if (flee.x !== 0) face = flee.x < 0 ? -1 : 1;
    vdir = 1;
    timer = 12;
  }

  if (phase % t.birdEvery === 0) {
    if (timer > 0) timer--;
    else {
      const r = rng.next();
      vdir = r < 0.4 ? 0 : r < 0.7 ? 1 : 2;
      timer = 8 + rng.int(40);
    }
    // a bird the level set circling (e.g. round a peak) keeps to its home: its object's anchor
    const home = c.obj !== 0 ? world.objects.get(c.obj) : undefined;
    if (home?.tags.includes('circling')) {
      if (Math.abs(c.x - home.x) > CIRCLE_RADIUS) face = home.x > c.x ? 1 : -1;
      if (c.y > home.y + 8) vdir = 1;
      else if (c.y < home.y - 12) vdir = 2;
    }
    // turn back before the scroll's edges, where the rollers would hide it
    if ((face > 0 && c.x + face >= world.w - EDGE_MARGIN) || (face < 0 && c.x + face < EDGE_MARGIN)) face = -face;
    let dy = vdir === 1 ? -1 : vdir === 2 ? 1 : 0;
    if (dy !== 0 && rng.chance(0.5)) dy = 0; // climbs and dives are gentle
    if (c.y < 10 && dy < 0) dy = 0;
    if (c.y > world.h * 0.7) dy = -1; // stay in the open sky
    const ok =
      relocate(world, def, c, face, dy, frame, face) ||
      relocate(world, def, c, face, -1, frame, face) ||
      relocate(world, def, c, face, -2, frame, face);
    if (!ok) relocate(world, def, c, 0, 0, frame, -face); // in the way: turn around
  } else if (frame !== c.frame || face !== c.face) {
    relocate(world, def, c, 0, 0, frame, face);
  }
  c.life = (timer << 2) | vdir;
  weather(world, def, c);
}

/** The gravity birds are built for: at it they hold their height; heavier drags them down, lighter lifts them. */
const NORMAL_GRAVITY = 2;

/**
 * Wind and gravity on a bird in flight. A wind past the breeze carries it downwind (a bird blown
 * to the edge of the scroll comes back in at the other side, like the clouds); an updraft lifts
 * it and a downdraft presses it down; heavy gravity makes it sink, and weightless or upside-down
 * gravity pulls it up.
 */
function weather(world: World, def: CreatureDef, c: Creature): void {
  const { tick, w } = world;
  const wind = windOf(world);
  const gust = (Math.abs(wind) - BREEZE) / (1 - BREEZE);
  if (gust > 0 && tick % Math.max(1, Math.round(5 * (1 - gust))) === 0) {
    const dx = wind > 0 ? 1 : -1;
    if (!nudge(world, def, c, dx, 0)) {
      const nx = c.x + dx;
      if ((dx > 0 && nx >= w - EDGE_MARGIN) || (dx < 0 && nx < EDGE_MARGIN)) {
        relocate(world, def, c, (dx > 0 ? EDGE_MARGIN : w - 1 - EDGE_MARGIN) - c.x, 0); // wrap around
      }
    }
  }
  const wy = windYOf(world);
  const draft = (Math.abs(wy) - BREEZE) / (1 - BREEZE);
  if (draft > 0 && tick % Math.max(1, Math.round(5 * (1 - draft))) === 0) {
    if (wy < 0) nudge(world, def, c, 0, -1);
    else relocate(world, def, c, 0, 1);
  }
  const pull = gravityOf(world) - NORMAL_GRAVITY;
  if (pull > 0 && tick % Math.max(1, Math.round(10 / pull)) === 0) relocate(world, def, c, 0, 1);
  else if (pull < 0 && tick % Math.max(1, Math.round(8 / -pull)) === 0) nudge(world, def, c, 0, -1);
}

export const BIRD_DEF = defineCreature({
  el: BIRD,
  frames: [GLIDE, DOWN, UP],
  variants: 4,
  paint: (_part, variant) => variant,
  think,
  spawnSpacing: 16,
});
