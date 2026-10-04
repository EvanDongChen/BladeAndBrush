import { registerElement, shade } from '../../core/elements';
import { registerGlow } from '../../core/glow';

/**
 * The moon (setpiece 'moon'). Solid and cuttable, but anchored: it hangs in the sky instead of
 * falling as a rigid piece, so a slash leaves it broken where it is. Not terrain for the scanner.
 */
export const MOON = 33;

registerElement({
  id: MOON,
  name: 'moon',
  kind: 'static',
  density: 100,
  flammability: 0,
  solidForScan: false,
  anchored: true,
  color: (c) => shade(236, 226, 196, c.aux),
});

/** A faint cool light around it. */
registerGlow({ el: MOON, r: 246, g: 240, b: 214, near: 0.12, far: 0.1 });
