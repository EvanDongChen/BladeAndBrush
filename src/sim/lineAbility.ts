/**
 * Skill-shot abilities: press to set the start, drag to aim, release to fire along the straight
 * line from press to release (clamped to a range). Nothing happens while aiming; a plain click is
 * cancelled. Once released, the effect sweeps along the line over a few ticks. Aim and release go
 * through the action log like any ability input, so replays match.
 */
import { registerAbility, type AbilityArgs } from '../core/abilities';
import { registerPass } from '../core/behaviors';
import type { World } from '../core/world';
import { defineTunables } from './tunables';

export const aimTunables = defineTunables(
  'aim',
  {
    /** Longest possible line (cells), like a skill shot's range. */
    range: 360,
    /** Shorter aims than this are cancelled (a plain click does nothing). */
    minLength: 6,
    /** How fast the effect travels along the line once released (cells per tick). */
    sweep: 48,
  },
  { range: [20, 960, 10], minLength: [0, 40, 1], sweep: [4, 400, 4] },
);

export interface Aim {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LineAbilityDef {
  id: string;
  name: string;
  icon: string;
  /** Preview color as 'r, g, b'. */
  color: string;
  /**
   * Apply the effect to one stretch of the line, (ax, ay) to (bx, by), with brush radius r.
   * (ux, uy) is the line's unit direction and `speed` the sweep speed in cells per tick.
   */
  apply(world: World, ax: number, ay: number, bx: number, by: number, r: number, ux: number, uy: number, speed: number): void;
}

const defs = new Map<string, LineAbilityDef>();

/** Where a line aimed from (x0, y0) toward (x, y) actually ends: clamped to the range. */
export function aimEnd(x0: number, y0: number, x: number, y: number): Aim {
  const dx = x - x0;
  const dy = y - y0;
  const len = Math.hypot(dx, dy);
  const k = len > aimTunables.range ? aimTunables.range / len : 1;
  return { x0, y0, x1: x0 + dx * k, y1: y0 + dy * k };
}

/** True if this ability is aimed as a line (so pages draw the preview while the pointer is held). */
export function isLineAbility(id: string): boolean {
  return defs.has(id);
}

/** Skill-shot preview on the grid-resolution canvas: the strip it will hit, the path, an arrow. */
export function drawAim(g: CanvasRenderingContext2D, id: string, aim: Aim, radius: number): void {
  const def = defs.get(id);
  if (!def) return;
  const { x0, y0, x1, y1 } = aim;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const rgb = len >= aimTunables.minLength ? def.color : '80, 80, 80';
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = `rgba(${rgb}, 0.18)`;
  g.lineWidth = Math.max(1, radius * 2);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.strokeStyle = `rgba(${rgb}, 0.9)`;
  g.lineWidth = 1;
  g.setLineDash([4, 3]);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.setLineDash([]);
  if (len >= aimTunables.minLength) {
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const s = Math.max(4, radius * 1.5);
    g.fillStyle = `rgba(${rgb}, 0.9)`;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x1 - ux * s - uy * s * 0.6, y1 - uy * s + ux * s * 0.6);
    g.lineTo(x1 - ux * s + uy * s * 0.6, y1 - uy * s - ux * s * 0.6);
    g.closePath();
    g.fill();
  }
  g.restore();
}

// ---- released lines travel along their path over a few ticks ----

interface Sweep {
  def: LineAbilityDef;
  aim: Aim;
  r: number;
  /** Cells of the line already done. */
  done: number;
}

const sweeps = new WeakMap<World, Sweep[]>();

registerPass({
  name: 'lineSweeps',
  phase: 'pre',
  order: 5,
  run: (world) => {
    const list = sweeps.get(world);
    if (!list || list.length === 0) return;
    const speed = Math.max(1, aimTunables.sweep);
    let keep = 0;
    for (const sw of list) {
      const { x0, y0, x1, y1 } = sw.aim;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const from = sw.done;
      const to = Math.min(len, from + speed);
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      sw.def.apply(world, x0 + ux * from, y0 + uy * from, x0 + ux * to, y0 + uy * to, sw.r, ux, uy, speed);
      sw.done = to;
      if (to < len) list[keep++] = sw;
    }
    list.length = keep;
  },
});

const radius = (args: AbilityArgs) => Math.max(1, args.radius ?? 4);

/** Register a skill-shot ability. */
export function registerLineAbility(def: LineAbilityDef): void {
  defs.set(def.id, def);
  let aiming: { x0: number; y0: number; x: number; y: number; r: number } | null = null;
  registerAbility({
    id: def.id,
    name: def.name,
    icon: def.icon,
    begin: (_world, s, args) => {
      aiming = { x0: s.x, y0: s.y, x: s.x, y: s.y, r: radius(args) };
    },
    move: (_world, _from, to) => {
      if (aiming) (aiming.x = to.x), (aiming.y = to.y);
    },
    end: (world) => {
      const a = aiming;
      aiming = null;
      if (!a) return;
      const aim = aimEnd(a.x0, a.y0, a.x, a.y);
      if (Math.hypot(aim.x1 - aim.x0, aim.y1 - aim.y0) < aimTunables.minLength) return; // cancelled
      let list = sweeps.get(world);
      if (!list) sweeps.set(world, (list = []));
      list.push({ def, aim, r: a.r, done: 0 });
    },
    drawCursor: (g) => {
      if (aiming) drawAim(g, def.id, aimEnd(aiming.x0, aiming.y0, aiming.x, aiming.y), aiming.r);
    },
  });
}
