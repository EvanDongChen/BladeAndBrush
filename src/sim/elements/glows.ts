import { El } from '../../core/elements';
import { registerGlow } from '../../core/glow';

/**
 * Fire gives off a warm glow that dims as each cell burns out. Free flames last ~26 ticks and
 * burning fuel ~48, matching the scales the fire color uses.
 */
registerGlow({
  el: El.FIRE,
  r: 255,
  g: 148,
  b: 52,
  near: 1,
  far: 0.7,
  level: (life, aux) => 0.3 + 0.7 * Math.min(1, life / (aux === 0 ? 26 : 48)),
});
