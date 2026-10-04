import { hash3, registerElement, rgba } from '../../core/elements';

/**
 * A raindrop: what steam condenses into when it cools (see sim/behaviors/gas.ts). It falls
 * straight down and turns into WATER where it lands, crediting the thing it landed on with
 * stats.rain (see sim/behaviors/rain.ts), so a level can ask for rain on its village.
 */
export const RAIN = 20;

registerElement({
  id: RAIN,
  name: 'rain',
  kind: 'liquid',
  density: 10,
  flammability: 0,
  solidForScan: false,
  // pale streaks with a little sparkle
  color: (c) => ((hash3(c.x, c.y, c.tick >> 2) & 7) === 0 ? rgba(214, 232, 244) : rgba(132, 166, 190)),
});
