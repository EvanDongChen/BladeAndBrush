import { El } from '../../core/elements';
import { forCapsule } from '../brush';
import { registerLineAbility } from '../lineAbility';
import { REPLACEABLE } from '../physics';
import { defineTunables } from '../tunables';

export const waterAbilityTunables = defineTunables(
  'waterAbility',
  {
    /** Chance per free cell along the line to get water. */
    density: 0.5,
  },
  { density: [0, 1, 0.05] },
);

/** Aim a line, release to drop a sheet of water along it. */
registerLineAbility({
  id: 'water',
  name: 'Water',
  icon: '水',
  color: '50, 110, 170',
  apply: (world, ax, ay, bx, by, r) => {
    const { el, rng, w } = world;
    const p = waterAbilityTunables.density;
    forCapsule(world, ax, ay, bx, by, r, (x, y) => {
      if (REPLACEABLE[el[y * w + x]] && rng.chance(p)) world.set(x, y, El.WATER, { aux: rng.int(256) });
    });
  },
});
