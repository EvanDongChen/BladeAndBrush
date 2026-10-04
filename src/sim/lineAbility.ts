/**
 * Skill-shot abilities: press to set the start, drag to aim, release to fire along the straight
 * line from press to release (clamped to a range). Nothing happens while aiming; a plain click is
 * cancelled. Holding longer before release charges the shot: a wider line with more power. Once
 * released, the effect sweeps along the line over a few ticks. Aim, charge (counted in sim ticks
 * between press and release) and release all go through the action log, so replays match.
 */
import { registerAbility, type AbilityArgs } from '../core/abilities';
import { registerPass } from '../core/behaviors';
import type { World } from '../core/world';
import './events';
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
    /** Ticks of holding to reach full charge (60 ticks = 1 second). */
    chargeTicks: 45,
    /** Width multiplier at full charge. */
    chargeWidth: 1.8,
    /** Power multiplier at full charge (splatter, throw speed, ignite and water amounts). */
    chargePower: 1.6,
  },
  {
    range: [20, 960, 10],
    minLength: [0, 40, 1],
    sweep: [4, 400, 4],
    chargeTicks: [1, 240, 1],
    chargeWidth: [1, 4, 0.1],
    chargePower: [1, 4, 0.1],
  },
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
   * Apply the effect to one stretch of the line, (ax, ay) to (bx, by), with brush radius r
   * (already widened by charge). (ux, uy) is the line's unit direction, `speed` the sweep speed in
   * cells per tick, and `power` 1 uncharged up to chargePower fully charged.
   */
  apply(world: World, ax: number, ay: number, bx: number, by: number, r: number, ux: number, uy: number, speed: number, power: number): void;
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

/** Charge 0..1 after holding for `ticks`. */
export function chargeOf(ticks: number): number {
  return Math.max(0, Math.min(1, ticks / Math.max(1, aimTunables.chargeTicks)));
}

/** The line's actual radius and power at a given charge. */
export function charged(radius: number, charge: number): { r: number; power: number } {
  return {
    r: radius * (1 + charge * (aimTunables.chargeWidth - 1)),
    power: 1 + charge * (aimTunables.chargePower - 1),
  };
}

/** True if this ability is aimed as a line (so pages draw the preview while the pointer is held). */
export function isLineAbility(id: string): boolean {
  return defs.has(id);
}

/** The ability's color as 'r, g, b' (for previews and effects). */
export function lineColor(id: string): string {
  return defs.get(id)?.color ?? '40, 40, 40';
}

/**
 * Skill-shot preview on the grid-resolution canvas: the strip it will hit (as wide as the charged
 * line, square-ended and outlined), the path, an arrow, and a charge bar across the start (like a
 * sword's guard) that fills outward while you hold.
 */
export function drawAim(g: CanvasRenderingContext2D, id: string, aim: Aim, radius: number, charge = 0): void {
  const def = defs.get(id);
  if (!def) return;
  const { x0, y0, x1, y1 } = aim;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ok = len >= aimTunables.minLength;
  const rgb = ok ? def.color : '80, 80, 80';
  const { r } = charged(radius, charge);
  const full = charge >= 1;
  // unit direction and normal (pointing up when the line is still just a press)
  const ux = len > 0 ? (x1 - x0) / len : 1;
  const uy = len > 0 ? (y1 - y0) / len : 0;
  const nx = -uy;
  const ny = ux;
  g.save();
  if (len > 0) {
    // the strip the line will clear: a flat-ended band with crisp edges
    const hw = Math.max(0.5, r);
    g.fillStyle = `rgba(${rgb}, ${0.1 + 0.16 * charge})`;
    g.beginPath();
    g.moveTo(x0 + nx * hw, y0 + ny * hw);
    g.lineTo(x1 + nx * hw, y1 + ny * hw);
    g.lineTo(x1 - nx * hw, y1 - ny * hw);
    g.lineTo(x0 - nx * hw, y0 - ny * hw);
    g.closePath();
    g.fill();
    g.strokeStyle = `rgba(${rgb}, ${0.3 + 0.3 * charge})`;
    g.lineWidth = 0.75;
    g.beginPath();
    g.moveTo(x0 + nx * hw, y0 + ny * hw);
    g.lineTo(x1 + nx * hw, y1 + ny * hw);
    g.moveTo(x0 - nx * hw, y0 - ny * hw);
    g.lineTo(x1 - nx * hw, y1 - ny * hw);
    g.stroke();
  }
  g.strokeStyle = `rgba(${rgb}, 0.9)`;
  g.lineWidth = full ? 2 : 1;
  g.setLineDash(full ? [] : [4, 3]);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.setLineDash([]);
  if (ok) {
    const s = Math.max(4, Math.min(r * 1.2, len * 0.35));
    g.fillStyle = `rgba(${rgb}, 0.9)`;
    g.beginPath();
    g.moveTo(x1 + ux * 2, y1 + uy * 2);
    g.lineTo(x1 - ux * s + nx * s * 0.5, y1 - uy * s + ny * s * 0.5);
    g.lineTo(x1 - ux * s - nx * s * 0.5, y1 - uy * s - ny * s * 0.5);
    g.closePath();
    g.fill();
  }
  // charge bar: a guard across the start of the line that fills from the middle outward
  const guard = Math.max(4, r + 3);
  g.lineCap = 'butt';
  g.lineWidth = 2.5;
  g.strokeStyle = 'rgba(40, 40, 40, 0.3)';
  g.beginPath();
  g.moveTo(x0 + nx * guard, y0 + ny * guard);
  g.lineTo(x0 - nx * guard, y0 - ny * guard);
  g.stroke();
  if (charge > 0) {
    const c = guard * charge;
    g.lineWidth = full ? 3.5 : 2.5;
    g.strokeStyle = `rgba(${rgb}, ${full ? 1 : 0.85})`;
    g.beginPath();
    g.moveTo(x0 + nx * c, y0 + ny * c);
    g.lineTo(x0 - nx * c, y0 - ny * c);
    g.stroke();
  }
  g.restore();
}

// ---- released lines travel along their path over a few ticks ----

interface Sweep {
  def: LineAbilityDef;
  aim: Aim;
  r: number;
  power: number;
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
      sw.def.apply(world, x0 + ux * from, y0 + uy * from, x0 + ux * to, y0 + uy * to, sw.r, ux, uy, speed, sw.power);
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
  let aiming: { x0: number; y0: number; x: number; y: number; r: number; tick: number } | null = null;
  registerAbility({
    id: def.id,
    name: def.name,
    icon: def.icon,
    begin: (world, s, args) => {
      aiming = { x0: s.x, y0: s.y, x: s.x, y: s.y, r: radius(args), tick: world.tick };
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
      const { r, power } = charged(a.r, chargeOf(world.tick - a.tick));
      let list = sweeps.get(world);
      if (!list) sweeps.set(world, (list = []));
      list.push({ def, aim, r, power, done: 0 });
      if (world.events.has('lineFire')) world.events.emit('lineFire', { id: def.id, ...aim, r, power });
    },
    drawCursor: (g) => {
      if (aiming) drawAim(g, def.id, aimEnd(aiming.x0, aiming.y0, aiming.x, aiming.y), aiming.r);
    },
  });
}
