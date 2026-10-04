import { mix, PAPER_COLOR, pack, registerShader, smoothstep, withAlpha } from '../shaders';

const INK_GREY = pack(96, 94, 90);

/**
 * Solid things that are not (or no longer) part of the painting: loose rock and earth, wood, leaves,
 * hay, bamboo, the moon, ink drops, debris, ash, dust. The same ink language as the generator's art:
 * the element's own color washed toward paper, STATIC fine strokes (fixed to the screen, so a piece
 * at rest never moves), and a darker rim where the body ends.
 */
registerShader({
  element: ['rock', 'tree', 'wood', 'earth', 'leaf', 'hay', 'bamboo', 'moon', 'far_rock', 'stain', 'splat', 'debris', 'ash', 'dust'],
  shade: (p) => {
    const wash = mix(p.base, PAPER_COLOR, 0.72);
    const strokes = smoothstep(0.55, 0.85, p.tex('hatch', p.x * 0.55 + p.y * 0.5, p.y * 0.8 - p.x * 0.45));
    const fine = smoothstep(0.62, 0.9, p.tex('hatch', p.x * 0.9 + p.y * 0.8 + 40, p.y * 1.4 - p.x * 0.7 + 90));
    let c = mix(wash, INK_GREY, strokes * 0.42 + fine * 0.16);
    const rim = 1 - smoothstep(0.55, 0.95, p.v);
    c = mix(c, INK_GREY, rim * 0.5);
    return withAlpha(c, 255);
  },
});
