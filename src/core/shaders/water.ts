import { hash3 } from '../elements';
import { clamp01, lerp, pack, registerShader, smoothstep } from '../shaders';

/** Light at the surface to deep indigo at the bottom: a woodblock-print blue. */
const TOP = [132, 172, 202];
const BOT = [24, 44, 88];

/**
 * Water: ONE gradient across the whole body (each vertical run of water is lit at its surface and
 * dark at its bottom), with two layers of fine brush streaks drifting in opposite directions and
 * crossing slowly: pale streaks that fade with depth, darker ones that deepen it, a bright rim at
 * the surface, and the odd pale glint.
 */
registerShader({
  element: 'water',
  run: true,
  noBase: true,
  shade: (p) => {
    const t = clamp01(p.depth);
    const d = Math.pow(t, 0.85);
    let r = lerp(TOP[0], BOT[0], d);
    let g = lerp(TOP[1], BOT[1], d);
    let b = lerp(TOP[2], BOT[2], d);
    const a = p.tex('flow', p.x * 0.5 + p.tick * 0.8, p.y * 1.5);
    const c = p.tex('flow', p.x * 0.38 - p.tick * 0.5 + 91, p.y * 1.2 + 37);
    const light = (Math.max(0, a - 0.55) * 2.4 + Math.max(0, c - 0.62) * 2) * (1 - 0.6 * t);
    const dark = Math.max(0, 0.4 - a) * 1.5 + Math.max(0, 0.35 - c) * 1.2;
    r += light * 70;
    g += light * 70;
    b += light * 55;
    const shade = 1 - dark * 0.3;
    r *= shade;
    g *= shade;
    b *= shade;
    if (p.topEdge) {
      const rim = 1 - smoothstep(0, 0.35, p.fy);
      r += rim * 46;
      g += rim * 46;
      b += rim * 36;
    }
    if (t < 0.7 && (hash3(p.x >> 1, p.y >> 1, p.tick >> 3) & 511) === 0) return pack(222, 238, 246);
    return pack(r, g, b);
  },
});
