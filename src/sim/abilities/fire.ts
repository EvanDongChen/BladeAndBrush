import { ignite } from '../behaviors/fire';
import { forCapsule } from '../brush';
import { registerLineAbility } from '../lineAbility';
import { FLAMMABILITY, REPLACEABLE } from '../physics';
import { defineTunables } from '../tunables';

export const fireAbilityTunables = defineTunables(
  'fireAbility',
  {
    /** Chance per flammable cell along the line to catch. */
    igniteChance: 0.7,
    /** Chance per empty cell along the line to get a free flame. */
    flameChance: 0.15,
  },
  { igniteChance: [0, 1, 0.05], flameChance: [0, 1, 0.01] },
);

/** Aim a line, release to send a line of fire along it: lights wood and leaves, drops flames in the air. */
registerLineAbility({
  id: 'fire',
  name: 'Fire',
  icon: '火',
  color: '214, 100, 30',
  apply: (world, ax, ay, bx, by, r) => {
    const { el, rng, w } = world;
    const { igniteChance, flameChance } = fireAbilityTunables;
    forCapsule(world, ax, ay, bx, by, r, (x, y) => {
      const e = el[y * w + x];
      if (FLAMMABILITY[e] > 0 ? rng.chance(igniteChance) : REPLACEABLE[e] && rng.chance(flameChance)) ignite(world, x, y);
    });
  },
});
