import type { Blueprint } from '../core/blueprint';
import { Flag } from '../core/constants';
import { El } from '../core/elements';
import type { World } from '../core/world';

/** Deterministic per-cell shade variation (0..255) for revealed cells. */
function cellAux(seed: number, x: number, y: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) & 255;
}

/** Copy one blueprint column into the world. Skips CUT cells and empty blueprint cells. */
export function revealColumn(bp: Blueprint, world: World, x: number): void {
  for (let y = 0; y < bp.h; y++) {
    const i = y * bp.w + x;
    const e = bp.el[i];
    if (e === El.EMPTY || world.flags[i] & Flag.CUT) continue;
    world.el[i] = e;
    world.owner[i] = bp.owner[i];
    world.aux[i] = cellAux(bp.seed, x, y);
    world.life[i] = 0;
    world.vx[i] = 0;
    world.vy[i] = 0;
    world.flags[i] |= Flag.GENERATED;
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
