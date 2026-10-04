import { rgba } from '../../core/elements';
import { num, registerSetpiece } from '../../core/setpieces';
import { artOf, PLANE } from '../artState';
import { MOON } from '../elements/moon';
import { rasterizeCoverage } from '../raster';

/**
 * { type: 'moon', x: 0.5, y: 0.2, r: 0.07, clear?: 0.07 }
 *
 * A full moon in the sky at (x, y) (fractions of the scroll), radius r (fraction of its height),
 * in the farthest mountain plane so anything nearer covers it. One object of kind 'moon'. The free
 * mountains leave the sky under it clear (`clear` = half width of that span).
 */
registerSetpiece({
  type: 'moon',
  label: 'Moon',
  order: 25,
  clears: (spec) => {
    const x = num(spec, 'x', 0.5);
    const half = num(spec, 'clear', 0.07);
    return [[x - half, x + half]];
  },
  run: ({ bp, dims, noise, newStroke }, spec) => {
    const { planes, u } = artOf(bp);
    const plane = planes[PLANE.MID];
    const K = u.k;
    const cx = num(spec, 'x', 0.5) * dims.w;
    const cy = num(spec, 'y', 0.2) * dims.h;
    const r = Math.max(2, num(spec, 'r', 0.07) * dims.h);
    const id = newStroke({ kind: 'moon', bbox: [0, 0, 0, 0], anchor: [Math.floor(cx), Math.floor(cy)], tags: ['moon'] });

    // Pale disc with soft grey maria, a slightly darker limb and an ink rim; only where the plane is empty.
    const ax = cx * K;
    const ay = cy * K;
    const R = r * K;
    const lit: [number, number, number] = [246, 240, 220];
    const mare: [number, number, number] = [206, 198, 178];
    const { buf } = plane;
    for (let y = Math.max(0, Math.floor(ay - R - 2)); y <= Math.min(u.artH - 1, Math.ceil(ay + R + 2)); y++) {
      for (let x = Math.max(0, Math.floor(ax - R - 2)); x <= Math.min(u.artW - 1, Math.ceil(ax + R + 2)); x++) {
        const i = y * u.artW + x;
        if (buf.own[i] !== 0) continue; // a far mountain is painted here
        const d = Math.hypot(x + 0.5 - ax, y + 0.5 - ay);
        const cov = Math.max(0, Math.min(1, R + 0.5 - d));
        if (cov <= 0) continue;
        const m = Math.max(0, noise.fbm2(x / (R * 0.6), y / (R * 0.6), 3) - 0.45) * 1.6;
        const limb = Math.min(1, (d / R) ** 4) * 0.35;
        const t = Math.min(1, m + limb);
        const c = (k: number) => Math.round(lit[k] + (mare[k] - lit[k]) * t);
        buf.blend(i, rgba(c(0), c(1), c(2), Math.round(255 * cov)), cov >= 0.5 ? id : undefined);
        const rim = Math.max(0, 1 - Math.abs(d - R + K * 0.4) / (K * 0.6));
        if (rim > 0) buf.blend(i, rgba(120, 112, 98, Math.round(110 * rim * cov)));
      }
    }

    const cell = (v: number) => Math.floor(v);
    const cells = rasterizeCoverage(bp, buf, K, id, MOON, plane.grid, [cell(cx - r - 1), cell(cy - r - 1), cell(cx + r + 1), cell(cy + r + 1)], false);
    const info = bp.registry.strokes.get(id);
    if (!cells) bp.registry.strokes.delete(id);
    else if (info) info.bbox = cells;
  },
});
