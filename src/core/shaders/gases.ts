import { dim, mix, registerShader, smoothstep, withAlpha } from '../shaders';

/** Smoke and steam: soft translucent washes that drift upward and swirl. */
registerShader({
  element: ['smoke', 'steam', 'cloud'],
  shade: (p) => {
    const cloud = p.tex('cloud', p.x * 0.45 + p.tick * 0.12, p.y * 0.45 + p.tick * 0.55);
    const alpha = 70 + 150 * smoothstep(0.25, 0.85, cloud);
    return withAlpha(mix(p.base, dim(p.base, 0.7), cloud * 0.5), alpha);
  },
});

/** Fire: the element's life ramp (white-hot to ember), licking and flickering, translucent at the tips. */
registerShader({
  element: 'fire',
  shade: (p) => {
    const f = p.tex('cloud', p.x * 0.7 + p.i * 0.37, p.y * 0.7 + p.tick * 2.4);
    const lick = p.topEdge ? smoothstep(0.1, 0.55, 1 - p.fy + f * 0.6) : 1;
    return withAlpha(dim(p.base, 0.82 + 0.55 * f), 255 * (0.55 + 0.45 * f) * lick);
  },
});

/** Rain: thin vertical streaks with the odd bright glint. */
registerShader({
  element: 'rain',
  shade: (p) => {
    const m = smoothstep(0.5, 0.12, Math.abs(p.fx - 0.5));
    return withAlpha(p.base, 235 * m);
  },
});
