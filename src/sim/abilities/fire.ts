import { registerAbility, type AbilityArgs, type PointerSample } from '../../core/abilities';
import type { World } from '../../core/world';
import { ignite } from '../behaviors/fire';
import { forCapsule } from '../brush';
import { FLAMMABILITY, REPLACEABLE } from '../physics';
import { defineTunables } from '../tunables';

export const fireAbilityTunables = defineTunables(
  'fireAbility',
  {
    /** Chance per flammable cell under the brush to catch. */
    igniteChance: 0.6,
    /** Chance per empty cell under the brush to get a free flame. */
    flameChance: 0.12,
    /** While held still: chance per cell per tick (within 60% of the radius) to flare up. */
    holdChance: 0.03,
  },
  { igniteChance: [0, 1, 0.05], flameChance: [0, 1, 0.01], holdChance: [0, 0.5, 0.01] },
);

let held: PointerSample | null = null;

/** Ignite flammable cells (e.g. trees) and drop loose flames in the air. Rock and water don't care. */
function scorch(world: World, a: PointerSample, b: PointerSample, r: number, burn: number, flame: number): void {
  const { el, rng, w } = world;
  forCapsule(world, a.x, a.y, b.x, b.y, r, (x, y) => {
    const e = el[y * w + x];
    if (FLAMMABILITY[e] > 0 ? rng.chance(burn) : REPLACEABLE[e] && rng.chance(flame)) ignite(world, x, y);
  });
}

const radius = (args: AbilityArgs) => Math.max(1, args.radius ?? 4);

registerAbility({
  id: 'fire',
  name: 'Fire',
  icon: '火',
  begin: (world, s, args) => {
    held = s;
    scorch(world, s, s, radius(args), fireAbilityTunables.igniteChance, fireAbilityTunables.flameChance);
  },
  move: (world, from, to, args) => {
    held = to;
    scorch(world, from, to, radius(args), fireAbilityTunables.igniteChance, fireAbilityTunables.flameChance);
  },
  tick: (world, args) => {
    if (!held) return;
    const p = fireAbilityTunables.holdChance;
    scorch(world, held, held, radius(args) * 0.6, p, p);
  },
  end: () => {
    held = null;
  },
});
