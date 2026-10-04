import type { Blueprint } from '../core/blueprint';
import { flags as config } from '../core/config';
import { FAR_PLANE, Flag, NO_PLANE } from '../core/constants';
import { El } from '../core/elements';
import type { World } from '../core/world';

/** Deterministic per-cell shade variation (0..255) for revealed cells. */
function cellAux(seed: number, x: number, y: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) & 255;
}

/**
 * Copy one blueprint column into the world, including the layers stacked behind each front cell.
 * Skips CUT cells (slashed ahead of the frontier): the whole stack there stays unrevealed.
 */
export function revealColumn(bp: Blueprint, world: World, x: number): void {
  const behind = bp.behind;
  const far = config.farLayerInteractive && bp.bg ? bp.bg : null;
  for (let y = 0; y < bp.h; y++) {
    const i = y * bp.w + x;
    const e = bp.el[i];
    const farHere = far !== null && far[i] !== El.EMPTY;
    if ((e === El.EMPTY && !farHere) || world.flags[i] & Flag.CUT) continue;
    if (e !== El.EMPTY) {
      world.el[i] = e;
      world.owner[i] = bp.owner[i];
      world.plane[i] = bp.plane?.[i] ?? NO_PLANE;
      if (behind && behind[0].el[i] !== El.EMPTY) {
        for (let d = 0; d < behind.length; d++) {
          world.behindEl[d][i] = behind[d].el[i];
          world.behindOwner[d][i] = behind[d].owner[i];
          world.behindPlane[d][i] = behind[d].plane[i];
        }
        world.flags[i] |= Flag.HAS_BEHIND;
      }
    }
    if (farHere) pushFar(world, i, e === El.EMPTY);
    world.aux[i] = cellAux(bp.seed, x, y);
    world.life[i] = 0;
    world.vx[i] = 0;
    world.vy[i] = 0;
    world.flags[i] |= Flag.GENERATED;
  }
}

/** Interactive far layer: real ROCK at the back of the stack (or the front if nothing is nearer). */
function pushFar(world: World, i: number, front: boolean): void {
  if (front) {
    world.el[i] = El.ROCK;
    world.owner[i] = 0;
    world.plane[i] = FAR_PLANE;
    return;
  }
  for (let d = 0; d < world.behindEl.length; d++) {
    if (world.behindEl[d][i] !== El.EMPTY) continue;
    world.behindEl[d][i] = El.ROCK;
    world.behindOwner[d][i] = 0;
    world.behindPlane[d][i] = FAR_PLANE;
    world.flags[i] |= Flag.HAS_BEHIND;
    return;
  }
}

/**
 * "The painting draws itself left to right" (section 3.5). Separate from generation: the
 * blueprint is complete up front; each tick the frontier copies the next columns into the world.
 */
export class Frontier {
  x = 0;

  constructor(
    readonly bp: Blueprint,
    public columnsPerTick = 4,
  ) {}

  get done(): boolean {
    return this.x >= this.bp.w;
  }

  advance(world: World, columns = this.columnsPerTick): void {
    if (this.done) return;
    const end = Math.min(this.bp.w, this.x + Math.max(0, Math.floor(columns)));
    for (let x = this.x; x < end; x++) revealColumn(this.bp, world, x);
    for (const s of this.bp.registry.waterSources) {
      if (s.x >= this.x && s.x < end) world.sources.push({ ...s });
    }
    this.x = end;
    if (world.events.has('frontierAdvance')) world.events.emit('frontierAdvance', { x: end });
  }

  revealAll(world: World): void {
    this.advance(world, this.bp.w - this.x);
  }
}
