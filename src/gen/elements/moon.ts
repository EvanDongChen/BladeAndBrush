import { registerElement, shade } from '../../core/elements';
import { registerGlow } from '../../core/glow';

/**
 * The moon (setpiece 'moon'). Solid and cuttable. It hangs in the sky while it is one piece (anchored
 * and hanging); cut it apart and every piece comes loose and falls like any rigid body. Not terrain
 * for the scanner.
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
  hanging: true,
  color: (c) => shade(236, 226, 196, c.aux),
});

/** A barely-there light: a big disc of cells adds up fast (16 cells per glow block), so these are tiny. */
registerGlow({ el: MOON, r: 240, g: 238, b: 226, near: 0.01, far: 0.004 });
