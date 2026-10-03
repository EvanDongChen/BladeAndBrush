import { registerElement, shade } from '../../core/elements';
import { registerPaintAux } from '../spawn';

/**
 * Bamboo: tall green stalks with darker joints. Static like wood, so a stalk stays put until it is
 * cut or burnt, and the part above a cut falls as one piece. Lighter than a tree, so it catches
 * fire faster, burns hot and throws sparks (see sim/behaviors/fire.ts).
 */
export const BAMBOO = 14;

/** aux below this is a joint band; at or above it is stalk, and the value is the shade jitter. */
export const BAMBOO_JOINT = 24;

registerElement({
  id: BAMBOO,
  name: 'bamboo',
  kind: 'static',
  density: 60,
  flammability: 0.55,
  solidForScan: true,
  color: (c) => (c.aux < BAMBOO_JOINT ? shade(58, 84, 52, c.aux * 10) : shade(112, 150, 88, c.aux)),
});

/** Painted bamboo gets a joint every 7 rows, so brush strokes look like stalks. */
registerPaintAux(BAMBOO, (world, _x, y) =>
  y % 7 === 0 ? world.rng.int(BAMBOO_JOINT) : BAMBOO_JOINT + world.rng.int(256 - BAMBOO_JOINT),
);
