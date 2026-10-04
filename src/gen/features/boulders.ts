import { El, rgba } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { registerParam } from '../../core/params';
import { artOf, PLANE } from '../artState';
import { DEPTH } from '../layout';
import { inkWash } from '../paint/shaders';
import { rasterizeCoverage } from '../raster';

registerParam({ key: 'boulderDensity', label: 'Boulders', min: 0, max: 1, step: 0.01, default: 0.5 });

/**
 * Boulders in clusters on the foreground land (and a few on the plain): lumpy rounded rocks in the
 * objects plane in front of the ground, bigger the closer they sit to the viewer. Each boulder is
 * its own stroke (owner) grouped under the land it rests on, and burns/cuts like any rock.
 */
registerFeature({
  name: 'boulders',
  label: 'Boulders',
  order: 18,
  run: ({ bp, dims, params, rng, noise, newStroke }) => {
    const d = Math.max(0, Math.min(1, params.boulderDensity));
    if (d <= 0) return;
    const { planes, u } = artOf(bp);
    const K = u.k;
    const land = bp.registry.strokes.get(planes[PLANE.NEAR].grid.owner[(dims.h - 1) * dims.w]); // the ground owns the bottom row
    const clusters = Math.round(3 + 11 * d);
    for (let c = 0; c < clusters; c++) {
      const cx = u.artW * rng.range(0.02, 0.98);
      const front = true; // boulders sit in the foreground
      const row = front ? PLANE.NEAR_OBJ : PLANE.MID_OBJ;
      const yTop = DEPTH.foreTop * dims.h * K;
      const yBot = DEPTH.floor * dims.h * K;
      const n = 2 + rng.int(4);
      for (let b = 0; b < n; b++) {
        const t = rng.next(); // 0 = far edge of the land, 1 = nearest the viewer
        const y = yTop + (yBot - yTop) * (0.15 + 0.8 * t) ;
        const x = cx + u.toArt(rng.range(-60, 60));
        const r = u.toArt((front ? 9 : 5) * (0.6 + 1.6 * t) * rng.range(0.8, 1.3)); // perspective: nearer = bigger
        const plane = planes[row];
        const id = newStroke({ kind: 'rock', bbox: [0, 0, 0, 0], anchor: [Math.floor(x / K), Math.floor(y / K)], group: land?.id });
        const x0 = Math.floor(x - r * 1.3);
        const w = Math.ceil(r * 2.6);
        const tops = new Float32Array(w);
        const bots = new Float32Array(w);
        for (let j = 0; j < w; j++) {
          const dx = (x0 + j + 0.5 - x) / (r * 1.3);
          const hh = dx * dx < 1 ? r * 0.85 * Math.sqrt(1 - dx * dx) * (0.85 + 0.3 * noise.n1((x0 + j) / (r * 0.7))) : 0;
          tops[j] = hh > 0 ? y - hh : Infinity;
          bots[j] = hh > 0 ? y + hh * 0.35 : -Infinity;
        }
        const shader = inkWash({ ink: [86, 84, 80], paper: [243, 238, 224], base: 0.05, edge: 0.55, edgeWidth: Math.max(2, r * 0.25), speckle: 0.1, noise });
        plane.paint.fillColumns(x0, tops, bots, shader, id);
        // a rounded outline and a couple of contour strokes, like the reference's pebbles
        const arc: [number, number][] = [];
        for (let j = 0; j < w; j += 2) if (tops[j] !== Infinity) arc.push([x0 + j, tops[j]]);
        plane.paint.stroke(arc, { width: Math.max(0.6, K * 0.45), color: rgba(52, 50, 46, 190), noise: 0.4, taper: 0.5 }, noise, id);
        const cells = rasterizeCoverage(bp, plane.buf, K, id, El.ROCK, plane.grid, [Math.floor(x0 / K) - 1, Math.floor((y - r) / K) - 1, Math.floor((x0 + w) / K) + 1, Math.floor((y + r * 0.5) / K) + 1], false);
        const info = bp.registry.strokes.get(id);
        if (!cells) bp.registry.strokes.delete(id);
        else if (info) info.bbox = cells;
      }
    }
  },
});
