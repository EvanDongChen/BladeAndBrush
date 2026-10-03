import { registerAbility, type AbilityArgs, type PointerSample } from '../../core/abilities';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { forCapsule } from '../brush';
import { REPLACEABLE } from '../physics';
import { defineTunables } from '../tunables';

export const waterAbilityTunables = defineTunables(
  'waterAbility',
  {
    /** Chance per free cell under a moving brush to get water. */
    density: 0.3,
    /** Water cells poured per tick while the pointer is held. */
    pour: 4,
  },
  { density: [0, 1, 0.05], pour: [0, 30, 1] },
);

let held: PointerSample | null = null;

function wet(world: World, a: PointerSample, b: PointerSample, args: AbilityArgs): void {
  const { el, rng, w } = world;
  const p = waterAbilityTunables.density;
  forCapsule(world, a.x, a.y, b.x, b.y, Math.max(1, args.radius ?? 4), (x, y) => {
    if (REPLACEABLE[el[y * w + x]] && rng.chance(p)) world.set(x, y, El.WATER, { aux: rng.int(256) });
  });
}

/** Pour water: a splash along the stroke, and a steady stream from the pointer while held. */
registerAbility({
  id: 'water',
  name: 'Water',
  icon: '水',
  begin: (world, s, args) => {
    held = s;
    wet(world, s, s, args);
  },
  move: (world, from, to, args) => {
    held = to;
    wet(world, from, to, args);
  },
  tick: (world, args) => {
    if (!held) return;
    const { rng } = world;
    const r = Math.max(1, (args.radius ?? 4) * 0.6);
    for (let k = 0; k < waterAbilityTunables.pour; k++) {
      const x = Math.round(held.x + rng.range(-r, r));
      const y = Math.round(held.y + rng.range(-r, r));
      if (world.inBounds(x, y) && REPLACEABLE[world.el[y * world.w + x]]) world.set(x, y, El.WATER, { aux: rng.int(256) });
    }
  },
  end: () => {
    held = null;
  },
});
