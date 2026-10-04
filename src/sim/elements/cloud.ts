import { registerElement, rgba } from '../../core/elements';

/**
 * A cloud. Hangs in the sky (static but anchored: never falls), not terrain. life = how much water
 * it holds: a dry cloud (life 0) just sits there; steam that rises into it soaks it, and a wet cloud
 * darkens and rains on whatever is below (see sim/behaviors/cloud.ts). vx = 1 marks a small cloud
 * made from cooling steam, which is gone once it has rained itself out.
 */
export const CLOUD = 21;

registerElement({
  id: CLOUD,
  name: 'cloud',
  kind: 'static',
  density: 1,
  flammability: 0,
  solidForScan: false,
  anchored: true,
  color: (c) => {
    const wet = Math.min(1, c.life / 160);
    const k = 0.94 + (c.aux / 255) * 0.06;
    return rgba(Math.round((242 - 112 * wet) * k), Math.round((240 - 106 * wet) * k), Math.round((234 - 96 * wet) * k));
  },
});
