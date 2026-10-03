import { registerBehavior } from '../../core/behaviors';
import { El, ELEMENTS } from '../../core/elements';
import type { World } from '../../core/world';
import { DEBRIS } from '../elements/debris';
import { FREE, moveCell, REPLACEABLE, RIGID } from '../physics';
import { defineTunables } from '../tunables';
import { markUnsupported } from './rigid';

export const debrisTunables = defineTunables(
  'debris',
  {
    /** Gravity adds 1 to vy every this many ticks (higher = floatier arcs). */
    gravityEvery: 2,
    /** Terminal speed (cells per tick). */
    maxSpeed: 12,
    /** Hitting something at this speed or faster rebounds (at half speed) instead of landing. */
    rebound: 3,
  },
  { gravityEvery: [1, 6, 1], maxSpeed: [2, 12, 1], rebound: [1, 13, 1] },
);

/** Turn a debris cell back into the element it carries. */
function land(world: World, j: number): void {
  const carried = world.aux[j];
  const ok = carried !== DEBRIS && ELEMENTS[carried] !== undefined;
  world.el[j] = ok ? carried : El.EMPTY;
  world.aux[j] = world.life[j];
  world.life[j] = 0;
  world.vx[j] = 0;
  world.vy[j] = 0;
  // rubble that came to rest in mid-air (e.g. on a piece that then fell away) gets picked up and falls
  if (ok && RIGID[carried]) markUnsupported(world);
}

/** Ballistic flight along vx/vy; lands as its carried element on the first thing it hits. */
function updateDebris(world: World, x: number, y: number): void {
  const { w, h, el, vx: VX, vy: VY } = world;
  const i = y * w + x;
  const max = debrisTunables.maxSpeed;
  const g = world.tick % Math.max(1, debrisTunables.gravityEvery | 0) === 0 ? 1 : 0;
  const vx = Math.max(-max, Math.min(max, VX[i]));
  const vy = Math.max(-max, Math.min(max, VY[i] + g));
  const steps = Math.max(1, Math.abs(vx), Math.abs(vy));

  let cx = x;
  let cy = y;
  let hit = vx === 0 && vy === 0;
  let hitX = false;
  let hitY = false;
  for (let s = 1; s <= steps && !hit; s++) {
    const nx = x + Math.round((vx * s) / steps);
    const ny = y + Math.round((vy * s) / steps);
    if (nx === cx && ny === cy) continue;
    const blocked = nx < 0 || ny < 0 || nx >= w || ny >= h || (!REPLACEABLE[el[ny * w + nx]] && el[ny * w + nx] !== DEBRIS);
    if (blocked) {
      hit = true;
      hitX = nx !== cx;
      hitY = ny !== cy;
    } else if (REPLACEABLE[el[ny * w + nx]]) {
      cx = nx;
      cy = ny;
    } // other flying debris: pass through it (a blast flies apart instead of jamming)
  }

  const j = cx === x && cy === y ? i : moveCell(world, x, y, cx, cy, FREE);
  if (hit && Math.max(Math.abs(vx), Math.abs(vy)) >= debrisTunables.rebound) {
    // a hard hit bounces off at half speed (a blast into the ground sprays back out)
    VX[j] = hitX ? -(vx >> 1) : vx;
    VY[j] = hitY ? -(vy >> 1) : vy;
  } else if (hit) land(world, j);
  else {
    VX[j] = vx;
    VY[j] = vy;
  }
}

registerBehavior(DEBRIS, updateDebris);
