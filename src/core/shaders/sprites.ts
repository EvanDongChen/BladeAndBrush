import { mix, PAPER_COLOR, pack, registerShader, smoothstep, withAlpha } from '../shaders';

const INK = pack(74, 70, 68);

/**
 * The hand-made creatures and flowers (people, birds, butterflies, flowers): their palette kept but
 * muted toward paper and grey, like a color wash on a drawing, with soft rounded edges, colors
 * blended smoothly between neighbouring cells, and a fine dark ink line where the body ends.
 */
registerShader({
  static: true,
  element: ['person', 'bird', 'butterfly', 'flower'],
  glsl: `
    ivec3 b = p.base.rgb;
    int l = byteF(float(b.r) * 0.3 + float(b.g) * 0.59 + float(b.b) * 0.11);
    ivec3 c = mixc(b, ivec3(l), 0.3);
    c = mixc(c, ivec3(240, 233, 216), 0.2);
    return ivec4(mixc(c, ivec3(74, 70, 68), (1.0 - ss(0.55, 0.95, p.v)) * 0.65), 255);`,
  shade: (p) => {
    const lum = (p.base & 255) * 0.3 + ((p.base >>> 8) & 255) * 0.59 + ((p.base >>> 16) & 255) * 0.11;
    let c = mix(p.base, pack(lum, lum, lum), 0.3);
    c = mix(c, PAPER_COLOR, 0.2);
    const rim = 1 - smoothstep(0.55, 0.95, p.v);
    return withAlpha(mix(c, INK, rim * 0.65), 255);
  },
});
