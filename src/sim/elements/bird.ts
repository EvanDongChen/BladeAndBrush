import { registerElement, rgba } from '../../core/elements';

/**
 * A bird: five cells in a little V that flap and glide across the sky (see sim/behaviors/bird.ts).
 * Palette index = variant: ink black, grey, white crane, brown.
 */
export const BIRD = 17;

const PALETTE = [rgba(38, 36, 34), rgba(110, 108, 104), rgba(236, 234, 226), rgba(96, 72, 52)];

registerElement({
  id: BIRD,
  name: 'bird',
  kind: 'projectile',
  density: 4,
  flammability: 0.5,
  solidForScan: false,
  color: (c) => PALETTE[c.aux & 31] ?? rgba(255, 0, 255),
});
