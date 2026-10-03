import { registerElement, rgba } from '../../core/elements';

/**
 * A butterfly: five cells that flutter around on their own (see sim/behaviors/butterfly.ts).
 * Palette index 0 is the body, 1..6 are wing colors by variant. Light and papery, so it burns
 * the moment fire touches it.
 */
export const BUTTERFLY = 16;

const PALETTE = [
  rgba(48, 38, 36), // body
  rgba(232, 140, 40), // orange
  rgba(240, 206, 70), // yellow
  rgba(240, 238, 226), // white
  rgba(140, 176, 214), // pale blue
  rgba(226, 150, 170), // pink
  rgba(150, 120, 190), // violet
];

registerElement({
  id: BUTTERFLY,
  name: 'butterfly',
  kind: 'projectile',
  density: 3,
  flammability: 0.9,
  solidForScan: false,
  color: (c) => PALETTE[c.aux & 31] ?? rgba(255, 0, 255),
});
