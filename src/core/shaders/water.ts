import { clamp01, registerShader, texture } from '../shaders';

/** A pale blue-grey ink wash at the surface, deepening to a dark indigo wash at the bottom. */
const TOP_R = 206, TOP_G = 222, TOP_B = 230;
const BOT_R = 66, BOT_G = 96, BOT_B = 134;
const INK_R = 44, INK_G = 66, INK_B = 100;
const PAPER_R = 240, PAPER_G = 238, PAPER_B = 228;

/** Same as shaders.ts smoothstep / byte, kept local so this inner loop stays call-free. */
const ss = (a: number, b: number, x: number) => {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};
const byte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// the depth gradient for a depth t, cached exactly (keyed by t itself): a body has few distinct depths
const SLOTS = 4096;
const slotT = new Float64Array(SLOTS).fill(-1);
const slotC = new Int32Array(SLOTS);

/**
 * Water as an ink painter draws it: ONE wash across the whole body (each vertical run of water is
 * pale at its surface and dark at its bottom), thin dark ink lines running through it, pale gaps
 * between them, and a fine ink line along the waterline. The lines flow slowly in two directions
 * and cross, so the water moves but stays a drawing.
 *
 * Written on plain channels (each step truncated to a byte like pack/mix do), for speed.
 */
registerShader({
  element: 'water',
  run: true,
  noBase: true,
  glsl: `
    float t = clamp(p.depth, 0.0, 1.0);
    float d = pow(t, 0.85);
    ivec3 c = ivec3(byteF(206.0 - 140.0 * d), byteF(222.0 - 126.0 * d), byteF(230.0 - 96.0 * d));
    float a = tex(0, p.x * 0.5 + p.tick * 0.8, p.y * 1.5);
    float b = tex(0, p.x * 0.38 - p.tick * 0.5 + 91.0, p.y * 1.2 + 37.0);
    float pale = ((ss(0.62, 0.7, b) * 0.5 + ss(0.7, 0.8, a) * 0.3) * (1.0 - 0.7 * t)) * 0.5;
    c = mixc(c, ivec3(240, 238, 228), pale);
    float line = ss(0.64, 0.72, a) * 0.5 + ss(0.7, 0.78, b) * 0.35;
    c = mixc(c, ivec3(44, 66, 100), min(0.7, line) * (0.5 + 0.35 * t));
    if (p.topEdge) c = mixc(c, ivec3(44, 66, 100), (1.0 - ss(0.1, 0.3, p.fy)) * 0.55);
    return ivec4(c, 255);`,
  shade: (p) => {
    const t = clamp01(p.depth);
    const slot = (t * 1048573) & (SLOTS - 1);
    let wc: number;
    if (slotT[slot] === t) wc = slotC[slot];
    else {
      const d = Math.pow(t, 0.85);
      wc = byte(TOP_R + (BOT_R - TOP_R) * d) | (byte(TOP_G + (BOT_G - TOP_G) * d) << 8) | (byte(TOP_B + (BOT_B - TOP_B) * d) << 16);
      slotT[slot] = t;
      slotC[slot] = wc;
    }
    const wr = wc & 255;
    const wg = (wc >> 8) & 255;
    const wb = (wc >> 16) & 255;
    const flow = texture('flow');
    const a = flow[((Math.floor(p.y * 1.5) & 255) << 8) | (Math.floor(p.x * 0.5 + p.tick * 0.8) & 255)] / 255;
    const c = flow[((Math.floor(p.y * 1.2 + 37) & 255) << 8) | (Math.floor(p.x * 0.38 - p.tick * 0.5 + 91) & 255)] / 255;
    const pale = ((ss(0.62, 0.7, c) * 0.5 + ss(0.7, 0.8, a) * 0.3) * (1 - 0.7 * t)) * 0.5;
    let r = byte(wr + (PAPER_R - wr) * pale);
    let g = byte(wg + (PAPER_G - wg) * pale);
    let b = byte(wb + (PAPER_B - wb) * pale);
    const line = ss(0.64, 0.72, a) * 0.5 + ss(0.7, 0.78, c) * 0.35;
    const li = Math.min(0.7, line) * (0.5 + 0.35 * t);
    r = byte(r + (INK_R - r) * li);
    g = byte(g + (INK_G - g) * li);
    b = byte(b + (INK_B - b) * li);
    if (p.topEdge) {
      const e = (1 - ss(0.1, 0.3, p.fy)) * 0.55;
      r = byte(r + (INK_R - r) * e);
      g = byte(g + (INK_G - g) * e);
      b = byte(b + (INK_B - b) * e);
    }
    return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  },
});
