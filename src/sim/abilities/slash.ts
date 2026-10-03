import { registerAbility, type AbilityArgs } from '../../core/abilities';
import { registerPass } from '../../core/behaviors';
import { flagOn } from '../../core/config';
import { Flag } from '../../core/constants';
import { El } from '../../core/elements';
import { createNoise } from '../../core/noise';
import type { World } from '../../core/world';
import { markUnsupported } from '../behaviors/rigid';
import { forCapsule } from '../brush';
import { CUTTABLE } from '../physics';
import { defineTunables } from '../tunables';

export const slashTunables = defineTunables(
  'slash',
  {
    /** Longest possible slash (cells), like a skill shot's range. */
    range: 360,
    /** Shorter aims than this are cancelled (a plain click does not slash). */
    minLength: 6,
    /** How fast the cut travels along the line once released (cells per tick). */
    sweep: 48,
    /** How ragged the cut edge is, as a fraction of the radius. */
    roughness: 0.35,
    /** Noise frequency of the ragged edge (higher = finer teeth). */
    grain: 0.3,
    /** Chance per cut solid cell to throw an ink droplet. */
    splatChance: 0.12,
    /** Droplet speed per unit of sweep speed. */
    splatSpeed: 0.2,
    /** Max droplets per tick of sweep. */
    maxSplats: 40,
  },
  {
    range: [20, 960, 10],
    minLength: [0, 40, 1],
    sweep: [4, 400, 4],
    roughness: [0, 0.9, 0.05],
    grain: [0.05, 1, 0.05],
    splatChance: [0, 1, 0.01],
    splatSpeed: [0, 1, 0.05],
    maxSplats: [0, 200, 5],
  },
);

const edgeNoise = createNoise(0x5a5);

export interface Aim {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where a slash aimed from (x0, y0) toward (x, y) actually ends: clamped to the range. */
export function aimEnd(x0: number, y0: number, x: number, y: number): Aim {
  const dx = x - x0;
  const dy = y - y0;
  const len = Math.hypot(dx, dy);
  const k = len > slashTunables.range ? slashTunables.range / len : 1;
  return { x0, y0, x1: x0 + dx * k, y1: y0 + dy * k };
}

/**
 * Skill-shot preview: the exact strip the slash will cut, drawn on the grid-resolution canvas.
 * Pages call this while the pointer is held with the slash tool.
 */
export function drawSlashAim(g: CanvasRenderingContext2D, aim: Aim, radius: number): void {
  const { x0, y0, x1, y1 } = aim;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ok = len >= slashTunables.minLength;
  g.save();
  g.lineCap = 'round';
  // the strip that will be cut
  g.strokeStyle = ok ? 'rgba(178, 34, 34, 0.18)' : 'rgba(80, 80, 80, 0.15)';
  g.lineWidth = Math.max(1, radius * 2);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  // the blade's path
  g.strokeStyle = ok ? 'rgba(178, 34, 34, 0.9)' : 'rgba(80, 80, 80, 0.6)';
  g.lineWidth = 1;
  g.setLineDash([4, 3]);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.setLineDash([]);
  // arrow head
  if (ok) {
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const s = Math.max(4, radius * 1.5);
    g.fillStyle = 'rgba(178, 34, 34, 0.9)';
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x1 - ux * s - uy * s * 0.6, y1 - uy * s + ux * s * 0.6);
    g.lineTo(x1 - ux * s + uy * s * 0.6, y1 - uy * s - ux * s * 0.6);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/**
 * Clear a jagged groove along a segment: every cell inside a noisy radius becomes EMPTY with the
 * CUT flag (so the frontier reveal never refills it). Cut solid material (rock, tree, earth...)
 * emits 'cut' and sometimes throws a SPLAT droplet away from the line.
 */
function carve(world: World, ax: number, ay: number, bx: number, by: number, r: number, speed: number): void {
  const { roughness, grain, splatChance, maxSplats } = slashTunables;
  const splatter = flagOn('splatter');
  const v = Math.max(1.5, Math.min(10, speed * slashTunables.splatSpeed));
  const { el, rng, w } = world;
  let splats = 0;

  forCapsule(world, ax, ay, bx, by, r * (1 + roughness), (x, y, ox, oy, d) => {
    const n = edgeNoise.fbm2(x * grain, y * grain, 3); // 0..1
    if (d > r * (1 + roughness * (2 * n - 1))) return;
    const prev = el[y * w + x];
    if (CUTTABLE[prev]) {
      world.set(x, y, El.EMPTY, { cut: true }); // emits 'cut'
    } else {
      // droplets, water, gas, empty air: cleared and flagged, but not a 'cut' scar
      world.set(x, y, El.EMPTY);
      world.flags[y * w + x] |= Flag.CUT;
      return;
    }
    if (!splatter || splats >= maxSplats || !rng.chance(splatChance)) return;

    // fly away from the line, with a little lift
    let ux = 0;
    let uy = -1;
    if (d > 0.01) {
      ux = ox / d;
      uy = oy / d;
    }
    const vx = Math.round(ux * v + rng.range(-1, 1));
    const vy = Math.round(uy * v - rng.range(0.5, 2.5));
    world.set(x, y, El.SPLAT, { vx: clamp(vx), vy: clamp(vy), aux: rng.int(256) });
    world.flags[y * w + x] |= Flag.CUT;
    splats++;
  });
  markUnsupported(world);
}

const clamp = (v: number) => Math.max(-12, Math.min(12, v));

// ---- released slashes travel along their line over a few ticks ----

interface Sweep {
  aim: Aim;
  r: number;
  /** Cells of the line already cut. */
  done: number;
}

const sweeps = new WeakMap<World, Sweep[]>();

registerPass({
  name: 'slashSweep',
  phase: 'pre',
  order: 5,
  run: (world) => {
    const list = sweeps.get(world);
    if (!list || list.length === 0) return;
    const speed = Math.max(1, slashTunables.sweep);
    let keep = 0;
    for (const sw of list) {
      const { x0, y0, x1, y1 } = sw.aim;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const from = sw.done;
      const to = Math.min(len, from + speed);
      const t0 = len > 0 ? from / len : 0;
      const t1 = len > 0 ? to / len : 1;
      carve(world, x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1, sw.r, speed);
      sw.done = to;
      if (to < len) list[keep++] = sw;
    }
    list.length = keep;
  },
});

// ---- the ability: press to set the start, drag to aim, release to slash ----

let aiming: { x0: number; y0: number; x: number; y: number; r: number } | null = null;

const radius = (args: AbilityArgs) => Math.max(1, args.radius ?? 4);

registerAbility({
  id: 'slash',
  name: 'Slash',
  icon: '斬',
  begin: (_world, s, args) => {
    aiming = { x0: s.x, y0: s.y, x: s.x, y: s.y, r: radius(args) };
  },
  move: (_world, _from, to) => {
    if (aiming) (aiming.x = to.x), (aiming.y = to.y);
  },
  end: (world, args) => {
    const a = aiming;
    aiming = null;
    if (!a) return;
    const aim = aimEnd(a.x0, a.y0, a.x, a.y);
    if (Math.hypot(aim.x1 - aim.x0, aim.y1 - aim.y0) < slashTunables.minLength) return; // cancelled
    let list = sweeps.get(world);
    if (!list) sweeps.set(world, (list = []));
    list.push({ aim, r: radius(args), done: 0 });
  },
  drawCursor: (g) => {
    if (aiming) drawSlashAim(g, aimEnd(aiming.x0, aiming.y0, aiming.x, aiming.y), aiming.r);
  },
});
