import { registerFeature } from '../../core/features';
import { artOf } from '../artState';
import { FAR_ROCK } from '../elements/farRock';
import { farWash } from '../paint/shaders';
import { planOf } from '../plan';
import { rasterizeCoverage } from '../raster';
import { getShape } from '../shapes';

const INK: [number, number, number] = [118, 122, 126];

/**
 * Distant ridges in the background plane (bp.bg / art.bg): pale, smooth, raised above the ground
 * and dissolving into mist at the foot. Not in the world grid, the registry or the scanner.
 */
registerFeature({
  name: 'farRidges',
  label: 'Far ridges',
  order: 5,
  run: ({ bp, dims, params, noise }) => {
    const { bg, bgPaint, u } = artOf(bp);
    const K = u.k;
    const owner = new Uint16Array(dims.w * dims.h); // bg cells have no strokes; scratch only
    const far = planOf(bp).filter((p) => p.depth === 'far');
    far.forEach((p, i) => {
      const id = i + 1;
      const base = u.toArt(p.y);
      const pr = getShape(p.kind).build(p, { u, params, base });
      if (pr.tops.length === 0) return;
      const tops = pr.tops.map((t) => (t < base ? t : u.artH));
      const shader = farWash({ ink: INK, strength: 0.42, edge: 0.35, edgeWidth: K * 4, noise, fadeFrom: base - u.toArt(110), fadeTo: base });
      bgPaint.fillColumns(pr.x0, tops, base, shader, id);
      const ridge: [number, number][] = [];
      for (let j = 0; j < tops.length; j += 2) if (tops[j] < base) ridge.push([pr.x0 + j, tops[j]]);
      bgPaint.stroke(ridge, { width: K * 0.5, color: (40 << 24) | (INK[2] << 16) | (INK[1] << 8) | INK[0], noise: 0.6 }, noise);
      const cell = (v: number) => Math.floor(v / K);
      rasterizeCoverage(bp, bg, K, id, FAR_ROCK, { el: bp.bg!, owner }, [cell(pr.x0), 0, cell(pr.x0 + tops.length), dims.h - 1], true);
    });
  },
});
