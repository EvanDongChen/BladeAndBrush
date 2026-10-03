import { registerAbility, type AbilityArgs } from '../../core/abilities';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { markUnsupported } from '../behaviors/rigid';

/** Live-tweakable from the sandbox. */
export const paintTunables = {
  /** Stamp spacing along a stroke, as a fraction of the radius. */
  spacing: 0.5,
};

function stamp(world: World, x: number, y: number, args: AbilityArgs): void {
  const el = args.el ?? El.ROCK;
  world.forCircle(x, y, args.radius ?? 3, (cx, cy) => {
    if (el === El.EMPTY) world.set(cx, cy, El.EMPTY);
    else world.set(cx, cy, el, { aux: world.rng.int(256) });
  });
  markUnsupported(world); // painted rock in the air falls; erased supports drop what they held
}

/**
 * Sandbox debug brush: paints args.el with args.radius. Goes through the action log like any
 * ability, so painted sessions replay exactly.
 */
registerAbility({
  id: 'paint',
  name: 'Paint',
  icon: '筆',
  debug: true,
  begin: (world, s, args) => stamp(world, s.x, s.y, args),
  move: (world, from, to, args) => {
    const step = Math.max(1, (args.radius ?? 3) * paintTunables.spacing);
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
    for (let k = 1; k <= n; k++) {
      stamp(world, from.x + ((to.x - from.x) * k) / n, from.y + ((to.y - from.y) * k) / n, args);
    }
  },
  end: () => {},
});
