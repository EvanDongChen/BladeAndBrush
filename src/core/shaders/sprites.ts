import { dim, mix, registerShader, smoothstep, withAlpha } from '../shaders';

/**
 * The hand-made creatures and flowers (people, birds, butterflies, flowers): their own palette,
 * unchanged, but drawn with soft rounded edges, colors blended smoothly between neighbouring
 * cells, and a thin darker ink line where the body ends so they sit in the painting.
 */
registerShader({
  element: ['person', 'bird', 'butterfly', 'flower'],
  shade: (p) => {
    const rim = 1 - smoothstep(0.55, 0.95, p.v);
    return withAlpha(mix(p.base, dim(p.base, 0.62), rim * 0.7), 255);
  },
});
