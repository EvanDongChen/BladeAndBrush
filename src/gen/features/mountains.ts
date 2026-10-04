import { El, rgba } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { artOf, PLANE } from '../artState';
import { recordMountain } from '../mountainStore';
import { inkWash } from '../paint/shaders';
import { planOf, type Placement } from '../plan';
import { rasterizeCoverage } from '../raster';
import { getShape, type Profile } from '../shapes';

/** Ink per depth: nearer is darker and more strongly lined. */
const TONE = {
  near: { ink: [70, 68, 64] as [number, number, number], fill: 0.03, outline: 120, texture: 0.32, ripple: 110 },
  mid: { ink: [110, 110, 106] as [number, number, number], fill: 0.07, outline: 80, texture: 0.22, ripple: 80 },
};
/** Paper-white: the occluder that hides whatever stands behind a mountain. */
const WHITE: [number, number, number] = [238, 231, 214];

/**
 * Planned mountains (gen/plan.ts), drawn back to front by the y of their foot, the way a raised
 * view is built: each has a white fill that hides what is behind it, a faint outline, hundreds of
 * short texture strokes along its inner contours and a few foot strokes; water ripples go behind
 * everything at its foot. Cells follow the art's coverage. Mountains far back (foot above
 * DEPTH.split) go in the mid plane and the rest in the near plane, so cutting a near mountain can
 * expose the one behind it; within a plane the nearer one wins.
 */
registerFeature({
  name: 'mountains',
  label: 'Mountains',
  order: 10,
  run: ({ bp, dims, params, rng, noise, newStroke }) => {
    const { planes, bgPaint, u } = artOf(bp);
    const K = u.k;
    const rugged = Math.max(1, Math.min(8, params.ruggedness));
    const placements = planOf(bp)
      .filter((p) => p.depth !== 'far')
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const cell = (v: number) => Math.floor(v / K);
    const ids: number[] = [];

    for (const p of placements) paintMountain(p);
    pruneHidden(ids);

    function paintMountain(p: Placement): void {
      const tone = p.depth === 'mid' ? TONE.mid : TONE.near;
      const plane = planes[p.depth === 'mid' ? PLANE.MID : PLANE.NEAR];
      const base = u.toArt(p.y);
      const pr = getShape(p.kind).build(p, { u, params, base });
      if (pr.tops.length === 0) return;
      const id = newStroke({ kind: 'mountain', bbox: [0, 0, 0, 0], anchor: [cell(pr.peakX), cell(pr.peakY)] });
      ids.push(id);

      // water ripples at the foot, behind everything (only visible in open paper)
      ripples(pr, base, tone.ripple);

      // white occluder with a hint of ink toward the ridge; a short skirt below the foot
      const shader = inkWash({ ink: tone.ink, paper: WHITE, base: tone.fill, edge: 0.22, edgeWidth: K * 2, speckle: 0.05, noise });
      const tops = pr.tops.map((t) => (t < base ? t : u.artH));
      plane.paint.fillColumns(pr.x0, tops, base + u.toArt(6), shader, id);

      texture(plane.paint, pr, base, tone);
      // outline along the silhouette
      const outline: [number, number][] = [];
      for (let j = 0; j < tops.length; j += 2) if (tops[j] < base) outline.push([pr.x0 + j, tops[j]]);
      plane.paint.stroke(outline, { width: u.toArt(1.3), color: rgba(...tone.ink, tone.outline), noise: 0.8, taper: 0.3 }, noise);
      foot(plane.paint, pr, base, tone);

      rasterizeCoverage(bp, plane.buf, K, id, El.ROCK, plane.grid, [cell(pr.x0), cell(pr.peakY), cell(pr.x0 + tops.length), cell(base + u.toArt(6)) + 1], true);
      recordMountain(bp, { id, depth: p.depth, plane: p.depth === 'mid' ? PLANE.MID : PLANE.NEAR, profile: pr });
    }

    /** Height of contour `l` (0 = silhouette, 1.. = inner layers, fractional = between) at column j. */
    function contourAt(pr: Profile, l: number, j: number): number {
      const lines = [pr.tops, ...pr.layers];
      const a = Math.min(lines.length - 1, Math.floor(l));
      const b = Math.min(lines.length - 1, a + 1);
      const f = l - a;
      return lines[a][j] * (1 - f) + lines[b][j] * f;
    }

    /** Many short faint strokes along the inner contours, mostly on the left and right thirds. */
    function texture(paint: (typeof planes)[number]['paint'], pr: Profile, base: number, tone: (typeof TONE)['near']): void {
      const n = pr.tops.length;
      const count = Math.round((n / u.toArt(100)) * (14 + 5 * rugged));
      const depthLines = pr.layers.length;
      for (let i = 0; i < count; i++) {
        const l = (i / count) * depthLines;
        const side = rng.chance(0.5) ? rng.range(0, 1 / 3) : rng.range(2 / 3, 1);
        const mid = Math.floor(side * n);
        const half = Math.floor(rng.next() * n * 0.12);
        const path: [number, number][] = [];
        const wobble = u.toArt(2 + 6 * (l / Math.max(1, depthLines)));
        for (let j = Math.max(0, mid - half); j < Math.min(n, mid + half); j += 3) {
          const y = contourAt(pr, l, j);
          if (!(y < base - K)) continue;
          path.push([pr.x0 + j, y + wobble * (noise.n2(j / 20, l * 3.7) - 0.5)]);
        }
        if (path.length < 2) continue;
        paint.stroke(path, { width: u.toArt(0.7), color: rgba(...tone.ink, Math.round(255 * tone.texture * rng.next())), noise: 0.5 }, noise);
      }
    }

    /** A few strokes hugging the foot on both sides, so the mountain sits on the land. */
    function foot(paint: (typeof planes)[number]['paint'], pr: Profile, base: number, tone: (typeof TONE)['near']): void {
      const n = pr.tops.length;
      for (const side of [0, 1]) {
        const strokes = 2 + rng.int(3);
        for (let s = 0; s < strokes; s++) {
          const len = Math.floor(n * rng.range(0.12, 0.3));
          const start = side === 0 ? Math.floor(rng.range(0, 0.08) * n) : n - len - Math.floor(rng.range(0, 0.08) * n);
          const dy = -u.toArt(rng.range(1, 10));
          const path: [number, number][] = [];
          for (let j = start; j < start + len; j += 4) path.push([pr.x0 + j, base + dy + u.toArt(3) * (noise.n1(j / 30 + s) - 0.5)]);
          if (path.length > 1) paint.stroke(path, { width: u.toArt(0.8), color: rgba(...tone.ink, 70 + rng.int(60)), noise: 0.5 }, noise);
        }
      }
    }

    /** Short wavy ripple strokes around the foot, in the background plane (behind everything). */
    function ripples(pr: Profile, base: number, alpha: number): void {
      const cx = pr.x0 + pr.tops.length / 2;
      const len = pr.tops.length * 0.9;
      let yk = 0;
      for (let r = 0; r < 8; r++) {
        yk += u.toArt(rng.range(1, 5));
        const half = len * rng.range(0.25, 0.5);
        const xs = cx + rng.range(-0.5, 0.5) * len * 0.25;
        const path: [number, number][] = [];
        for (let j = -half; j < half; j += 5) path.push([xs + j, base + yk + u.toArt(1.5) * Math.sin(j * 0.15) * (noise.n1(j * 0.05) * 2)]);
        if (path.length > 1) bgPaint.stroke(path, { width: u.toArt(0.6), color: rgba(100, 100, 100, Math.round(alpha * rng.range(0.4, 1))), noise: 0.4 }, noise);
      }
    }

    /** Mountains in the same plane may hide each other completely: drop those, and fit bboxes to what is left. */
    function pruneHidden(owned: number[]): void {
      const near = planes[PLANE.NEAR].grid;
      const mid = planes[PLANE.MID].grid;
      const boxes = new Map<number, [number, number, number, number]>();
      const mine = new Set(owned);
      for (const g of [near, mid]) {
        for (let i = 0; i < g.owner.length; i++) {
          const o = g.owner[i];
          if (!mine.has(o)) continue;
          const x = i % dims.w;
          const y = (i / dims.w) | 0;
          const b = boxes.get(o);
          if (!b) boxes.set(o, [x, y, x, y]);
          else {
            b[0] = Math.min(b[0], x);
            b[1] = Math.min(b[1], y);
            b[2] = Math.max(b[2], x);
            b[3] = Math.max(b[3], y);
          }
        }
      }
      for (const id of owned) {
        const b = boxes.get(id);
        const info = bp.registry.strokes.get(id);
        if (!b) bp.registry.strokes.delete(id);
        else if (info) info.bbox = b;
      }
    }
  },
});
