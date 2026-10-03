import { registerAbility, type AbilityArgs, type PointerSample } from '../../core/abilities';
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
    /** How ragged the cut edge is, as a fraction of the radius. */
    roughness: 0.35,
    /** Noise frequency of the ragged edge (higher = finer teeth). */
    grain: 0.3,
    /** Chance per cut solid cell to throw an ink droplet. */
    splatChance: 0.12,
    /** Droplet speed per unit of pointer speed (cells per tick). */
    splatSpeed: 0.5,
    /** Max droplets per stroke segment. */
    maxSplats: 30,
  },
  {
    roughness: [0, 0.9, 0.05],
    grain: [0.05, 1, 0.05],
    splatChance: [0, 1, 0.01],
    splatSpeed: [0, 2, 0.05],
    maxSplats: [0, 200, 5],
  },
);

const edgeNoise = createNoise(0x5a5);

/**
 * Clear a jagged groove along the segment: every cell inside a noisy radius becomes EMPTY with the
 * CUT flag (so the frontier reveal never refills it). Cut solid material (rock, tree, earth...)
 * emits 'cut' and sometimes throws a SPLAT droplet away from the stroke, faster for faster swipes.
 */
function carve(world: World, a: PointerSample, b: PointerSample, args: AbilityArgs): void {
  const r = Math.max(1, args.radius ?? 4);
  const { roughness, grain, splatChance, maxSplats } = slashTunables;
  const splatter = flagOn('splatter');
  const v = Math.max(1.5, Math.min(10, b.speed * slashTunables.splatSpeed));
  const { el, rng, w } = world;
  let splats = 0;

  forCapsule(world, a.x, a.y, b.x, b.y, r * (1 + roughness), (x, y, ox, oy, d) => {
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

    // fly away from the stroke line, with a little lift
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

registerAbility({
  id: 'slash',
  name: 'Slash',
  icon: '斬',
  begin: (world, s, args) => carve(world, s, s, args),
  move: (world, from, to, args) => carve(world, from, to, args),
  end: () => {},
});
