import type { Blueprint, StrokeInfo } from '../core/blueprint';
import { flags as config } from '../core/config';
import { FAR_PLANE, Flag, NO_PLANE } from '../core/constants';
import { El } from '../core/elements';
import { placers } from '../core/objects';
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
      world.obj[i] = bp.owner[i]; // generated material belongs to the stroke that painted it
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
    if (bp.foot?.[i]) world.flags[i] |= Flag.FOOT;
  }
}

/** Interactive far layer: real ROCK at the back of the stack (or the front if nothing is nearer). */
function pushFar(world: World, i: number, front: boolean): void {
  if (front) {
    world.el[i] = El.ROCK;
    world.owner[i] = 0;
    world.obj[i] = 0;
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

/** Column the frontier must pass to reveal an object: a creature waits until the ground around it is there. */
const revealAt = (s: StrokeInfo) => s.anchor[0] + (s.spawn ? 8 : 0);

/**
 * "The painting draws itself left to right" (section 3.5). Separate from generation: the
 * blueprint is complete up front; each tick the frontier copies the next columns into the world.
 * Tracked objects (core/objects.ts) join world.objects when the frontier reaches their anchor, and
 * creatures are placed there by the sim's placer for their element.
 */
export class Frontier {
  x = 0;
  /** Registry entries sorted by when they are revealed, and the next one to reveal. */
  private readonly pending: StrokeInfo[];
  private next = 0;
  /** Cells per object id in front, as revealed (WorldObject.cells): what a metric sees of it untouched. */
  private readonly cellCount = new Map<number, number>();

  constructor(
    readonly bp: Blueprint,
    public columnsPerTick = 4,
  ) {
    this.pending = [...bp.registry.strokes.values()].sort((a, b) => revealAt(a) - revealAt(b) || a.id - b.id);
    for (let i = 0; i < bp.owner.length; i++) {
      const o = bp.owner[i];
      if (o !== 0 && bp.el[i] !== El.EMPTY) this.cellCount.set(o, (this.cellCount.get(o) ?? 0) + 1);
    }
  }

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
    // after the cells, so a creature is placed into the terrain it stands on
    while (this.next < this.pending.length && (revealAt(this.pending[this.next]) < end || end >= this.bp.w)) this.reveal(world, this.pending[this.next++]);
    this.x = end;
    if (world.events.has('frontierAdvance')) world.events.emit('frontierAdvance', { x: end });
  }

  revealAll(world: World): void {
    this.advance(world, this.bp.w - this.x);
  }

  private reveal(world: World, s: StrokeInfo): void {
    world.objects.set(s.id, {
      id: s.id,
      kind: s.kind,
      tags: s.tags ?? [],
      el: s.spawn?.el ?? 0,
      x: s.anchor[0],
      y: s.anchor[1],
      bbox: [...s.bbox],
      cells: this.cellCount.get(s.id) ?? 0,
      stats: {},
    });
    if (s.spawn) placers.get(s.spawn.el)?.place(world, s.anchor[0], s.anchor[1], { obj: s.id, variant: s.spawn.variant, face: s.spawn.face });
  }
}
