import { clamp01, lerp, mix, pack, registerShader, smoothstep } from '../shaders';

/** A pale blue-grey ink wash at the surface, deepening to a dark indigo wash at the bottom. */
const TOP = [206, 222, 230];
const BOT = [66, 96, 134];
const INK = pack(44, 66, 100);
const PAPER = pack(240, 238, 228);

/**
 * Water as an ink painter draws it: ONE wash across the whole body (each vertical run of water is
 * pale at its surface and dark at its bottom), thin dark ink lines running through it, pale gaps
 * between them, and a fine ink line along the waterline. The lines flow slowly in two directions
 * and cross, so the water moves but stays a drawing.
 */
registerShader({
  element: 'water',
  run: true,
  noBase: true,
  shade: (p) => {
    const t = clamp01(p.depth);
    const d = Math.pow(t, 0.85);
    let col = pack(lerp(TOP[0], BOT[0], d), lerp(TOP[1], BOT[1], d), lerp(TOP[2], BOT[2], d));
    const a = p.tex('flow', p.x * 0.5 + p.tick * 0.8, p.y * 1.5);
    const c = p.tex('flow', p.x * 0.38 - p.tick * 0.5 + 91, p.y * 1.2 + 37);
    const pale = (smoothstep(0.62, 0.7, c) * 0.5 + smoothstep(0.7, 0.8, a) * 0.3) * (1 - 0.7 * t);
    col = mix(col, PAPER, pale * 0.5);
    const line = smoothstep(0.64, 0.72, a) * 0.5 + smoothstep(0.7, 0.78, c) * 0.35;
    col = mix(col, INK, Math.min(0.7, line) * (0.5 + 0.35 * t));
    if (p.topEdge) col = mix(col, INK, (1 - smoothstep(0.1, 0.3, p.fy)) * 0.55);
    return col;
  },
});
