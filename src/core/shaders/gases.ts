import { registerShader, texture } from '../shaders';

/** Same as shaders.ts smoothstep / byte, kept local so these inner loops stay call-free. */
const ss = (a: number, b: number, x: number) => {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};
const byte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** Smoke and steam: soft translucent washes that drift upward and swirl. */
registerShader({
  element: ['smoke', 'steam', 'cloud'],
  glsl: `
    float cloud = tex(2, p.x * 0.45 + p.tick * 0.12, p.y * 0.45 + p.tick * 0.55);
    float t = cloud * 0.5;
    ivec3 b = p.base.rgb;
    ivec3 d = ivec3(byteF(float(b.r) * 0.7), byteF(float(b.g) * 0.7), byteF(float(b.b) * 0.7));
    return ivec4(mixc(b, d, t), byteF(70.0 + 150.0 * ss(0.25, 0.85, cloud)));`,
  shade: (p) => {
    const cloud = texture('cloud')[((Math.floor(p.y * 0.45 + p.tick * 0.55) & 255) << 8) | (Math.floor(p.x * 0.45 + p.tick * 0.12) & 255)] / 255;
    const alpha = 70 + 150 * ss(0.25, 0.85, cloud);
    // mix(base, dim(base, 0.7), cloud * 0.5)
    const t = cloud * 0.5;
    const base = p.base;
    const br = base & 255;
    const bg = (base >>> 8) & 255;
    const bb = (base >>> 16) & 255;
    const r = byte(br + (byte(br * 0.7) - br) * t);
    const g = byte(bg + (byte(bg * 0.7) - bg) * t);
    const b = byte(bb + (byte(bb * 0.7) - bb) * t);
    return ((byte(alpha) << 24) | (b << 16) | (g << 8) | r) >>> 0;
  },
});

/** Fire: the element's life ramp (white-hot to ember), licking and flickering, translucent at the tips. */
registerShader({
  element: 'fire',
  glsl: `
    float f = tex(2, p.x * 0.7 + p.i * 0.37, p.y * 0.7 + p.tick * 2.4);
    float lick = p.topEdge ? ss(0.1, 0.55, 1.0 - p.fy + f * 0.6) : 1.0;
    float k = 0.82 + 0.55 * f;
    ivec3 b = p.base.rgb;
    return ivec4(byteF(float(b.r) * k), byteF(float(b.g) * k), byteF(float(b.b) * k), byteF(255.0 * (0.55 + 0.45 * f) * lick));`,
  shade: (p) => {
    const f = texture('cloud')[((Math.floor(p.y * 0.7 + p.tick * 2.4) & 255) << 8) | (Math.floor(p.x * 0.7 + p.i * 0.37) & 255)] / 255;
    const lick = p.topEdge ? ss(0.1, 0.55, 1 - p.fy + f * 0.6) : 1;
    const k = 0.82 + 0.55 * f;
    const base = p.base;
    const r = byte((base & 255) * k);
    const g = byte(((base >>> 8) & 255) * k);
    const b = byte(((base >>> 16) & 255) * k);
    return ((byte(255 * (0.55 + 0.45 * f) * lick) << 24) | (b << 16) | (g << 8) | r) >>> 0;
  },
});

/** Rain: thin vertical streaks with the odd bright glint. */
registerShader({
  element: 'rain',
  glsl: `
    float m = ss(0.5, 0.12, abs(p.fx - 0.5));
    return ivec4(p.base.rgb, byteF(235.0 * m));`,
  shade: (p) => {
    const m = ss(0.5, 0.12, Math.abs(p.fx - 0.5));
    return ((p.base & 0xffffff) | (byte(235 * m) << 24)) >>> 0;
  },
});
