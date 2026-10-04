import { registerShader, texture } from '../shaders';

const INK_R = 96, INK_G = 94, INK_B = 90;
const PAPER_R = 240, PAPER_G = 233, PAPER_B = 216; // PAPER_COLOR

/** Same as shaders.ts smoothstep / byte, kept local so this inner loop stays call-free. */
const ss = (a: number, b: number, x: number) => {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};
const byte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/**
 * Solid things that are not (or no longer) part of the painting: loose rock and earth, wood, leaves,
 * hay, bamboo, the moon, ink drops, debris, ash, dust. The same ink language as the generator's art:
 * the element's own color washed toward paper, STATIC fine strokes (fixed to the screen, so a piece
 * at rest never moves), and a darker rim where the body ends.
 *
 * Written on plain channels (each step truncated to a byte like pack/mix do), for speed.
 */
registerShader({
  static: true,
  element: ['rock', 'tree', 'wood', 'earth', 'leaf', 'hay', 'bamboo', 'moon', 'far_rock', 'stain', 'splat', 'debris', 'ash', 'dust'],
  glsl: `
    ivec3 c = mixc(p.base.rgb, ivec3(240, 233, 216), 0.72);
    float s1 = tex(1, p.x * 0.55 + p.y * 0.5, p.y * 0.8 - p.x * 0.45);
    float s2 = tex(1, p.x * 0.9 + p.y * 0.8 + 40.0, p.y * 1.4 - p.x * 0.7 + 90.0);
    c = mixc(c, ivec3(96, 94, 90), ss(0.55, 0.85, s1) * 0.42 + ss(0.62, 0.9, s2) * 0.16);
    c = mixc(c, ivec3(96, 94, 90), (1.0 - ss(0.55, 0.95, p.v)) * 0.5);
    return ivec4(c, 255);`,
  shade: (p) => {
    const base = p.base;
    const br = base & 255;
    const bg = (base >>> 8) & 255;
    const bb = (base >>> 16) & 255;
    let r = byte(br + (PAPER_R - br) * 0.72);
    let g = byte(bg + (PAPER_G - bg) * 0.72);
    let b = byte(bb + (PAPER_B - bb) * 0.72);
    const hatch = texture('hatch');
    const x = p.x;
    const y = p.y;
    const s1 = hatch[((Math.floor(y * 0.8 - x * 0.45) & 255) << 8) | (Math.floor(x * 0.55 + y * 0.5) & 255)] / 255;
    const s2 = hatch[((Math.floor(y * 1.4 - x * 0.7 + 90) & 255) << 8) | (Math.floor(x * 0.9 + y * 0.8 + 40) & 255)] / 255;
    const ink = ss(0.55, 0.85, s1) * 0.42 + ss(0.62, 0.9, s2) * 0.16;
    r = byte(r + (INK_R - r) * ink);
    g = byte(g + (INK_G - g) * ink);
    b = byte(b + (INK_B - b) * ink);
    const rim = (1 - ss(0.55, 0.95, p.v)) * 0.5;
    r = byte(r + (INK_R - r) * rim);
    g = byte(g + (INK_G - g) * rim);
    b = byte(b + (INK_B - b) * rim);
    return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  },
});
