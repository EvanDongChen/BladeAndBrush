import { El, rgba } from '../../core/elements';
import { registerFeature } from '../../core/features';
import type { Noise } from '../../core/noise';
import type { Rng } from '../../core/rng';
import { artOf, PLANE } from '../artState';
import { recordMountain } from '../mountainStore';
import type { Painter, Shader } from '../paint/painter';
import { ink, inkStroke } from '../paint/strokes';
import { planOf } from '../plan';
import { rasterizeCoverage } from '../raster';
import { getShape, type Profile } from '../shapes';
import type { Units } from '../units';

type RGB = [number, number, number];

/** Ink per depth row: farther rows are paler (atmosphere). */
const TONE = {
  near: { ink: [96, 96, 94] as RGB, wash: 0.05, ridge: 0.16, line: 1, ripple: 0.45 },
  mid: { ink: [128, 128, 126] as RGB, wash: 0.04, ridge: 0.11, line: 0.7, ripple: 0.3 },
};
type Tone = (typeof TONE)['near'];
/** Paper-white: the occluder that hides whatever stands behind a mountain. */
const PAPER: RGB = [241, 235, 220];

/**
 * Planned mountains (gen/plan.ts), drawn back to front by the y of their foot. Each one, in order:
 * water ripples behind everything, a paper-white occluder with a light wash (our ink style: a
 * little tone toward the ridge and on the shaded right side), a faint broken outline, foot skirts,
 * a sweep of short texture strokes across its nested layers, and sometimes broad shading strokes.
 * ROCK cells follow the occluder's coverage. Mountains far back go in the mid plane, the rest in
 * the near plane, so cutting a near one exposes the one behind; within a plane the nearer wins.
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

    for (const p of placements) {
      const tone = p.depth === 'mid' ? TONE.mid : TONE.near;
      const planeIdx = p.depth === 'mid' ? PLANE.MID : PLANE.NEAR;
      const plane = planes[planeIdx];
      const base = u.toArt(p.y);
      const pr = getShape(p.kind).build(p, { u, params, base });
      if (pr.tops.length === 0 || !pr.grid) continue;
      const id = newStroke({ kind: 'mountain', bbox: [0, 0, 0, 0], anchor: [cell(pr.peakX), cell(pr.peakY)] });
      ids.push(id);

      ripples(bgPaint, pr, base, tone, rng, noise, u);

      // occluder: down to the foot, plus a shallow wedge below its middle so it hides what is behind
      const n = pr.tops.length;
      const bottoms = new Float32Array(n);
      for (let j = 0; j < n; j++) bottoms[j] = base + u.toArt(22) * (1 - Math.abs((2 * j) / Math.max(1, n - 1) - 1));
      const cx = pr.x0 + n / 2;
      plane.paint.fillColumns(pr.x0, pr.tops, bottoms, washShader(tone, cx, n / 2, K), id);

      feet(plane.paint, pr, tone, rng, noise, u);
      texture(plane.paint, pr, tone, rugged, rng, noise, u);
      inkStroke(plane.paint, pr.grid[0], noise, { wid: u.toArt(2.2), color: ink(0.3 * tone.line, tone.ink), noi: 1, salt: id * 1.7 });

      let maxBottom = 0;
      for (const b of bottoms) if (b > maxBottom) maxBottom = b;
      rasterizeCoverage(bp, plane.buf, K, id, El.ROCK, plane.grid, [cell(pr.x0) - 1, cell(pr.peakY) - 1, cell(pr.x0 + n) + 1, cell(maxBottom) + 1], true);
      recordMountain(bp, { id, depth: p.depth, plane: planeIdx, profile: pr });
    }
    pruneHidden();

    /** Mountains in the same plane may hide each other completely: drop those, and fit bboxes to what is left. */
    function pruneHidden(): void {
      const boxes = new Map<number, [number, number, number, number]>();
      const mine = new Set(ids);
      for (const g of [planes[PLANE.NEAR].grid, planes[PLANE.MID].grid]) {
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
      for (const id of ids) {
        const b = boxes.get(id);
        const info = bp.registry.strokes.get(id);
        if (!b) bp.registry.strokes.delete(id);
        else if (info) info.bbox = b;
      }
    }
  },
});

/** Paper-white with a light ink wash: a little tone under the ridge and on the right (shaded) side. */
function washShader(tone: Tone, cx: number, halfW: number, K: number): Shader {
  const [pr, pg, pb] = PAPER;
  const [ir, ig, ib] = tone.ink;
  const ridgeW = K * 10;
  return (x, _y, dTop) => {
    let a = tone.wash + tone.ridge * Math.exp(-dTop / ridgeW);
    const side = (x - cx) / halfW;
    if (side > 0) a += 0.05 * side;
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    return rgba((pr + (ir - pr) * a + 0.5) | 0, (pg + (ig - pg) * a + 0.5) | 0, (pb + (ib - pb) * a + 0.5) | 0);
  };
}

/**
 * Texture: many short faint strokes, swept from the outer layers to the inner ones. Each picks a
 * centre on the left or right third of the mountain and follows the (interpolated) layer there,
 * wobbling more on the outer layers. Some mountains also get broad, very faint shading strokes.
 */
function texture(paint: Painter, pr: Profile, tone: Tone, rugged: number, rng: Rng, noise: Noise, u: Units): void {
  const G = pr.grid!;
  const L = G.length;
  const N = G[0].length;
  const size = Math.min(1.6, Math.max(0.5, pr.tops.length / u.toArt(500)));
  const count = Math.round((90 + 16 * rugged) * size);
  const shade = rng.chance(0.2);
  for (let i = 0; i < count; i++) {
    const layer = (i / count) * (L - 1);
    const lo = Math.floor(layer);
    const hi = Math.min(L - 1, lo + 1);
    const f = layer - lo;
    const side = rng.chance(0.5) ? rng.next() / 3 : 2 / 3 + rng.next() / 3;
    const mid = Math.floor(side * N);
    const half = Math.floor(rng.next() * N * 0.2);
    const a = Math.max(0, mid - half);
    const b = Math.min(N, mid + half);
    if (b - a < 2) continue;
    const amp = u.toArt(26 / (layer + 1));
    const pts: [number, number][] = [];
    for (let j = a; j < b; j++) {
      const x = G[lo][j][0] * (1 - f) + G[hi][j][0] * f;
      const y = G[lo][j][1] * (1 - f) + G[hi][j][1] * f;
      pts.push([x + amp * (noise.n2(x * 0.05, j * 0.5) - 0.5), y + amp * (noise.n2(y * 0.05 + 40, j * 0.5) - 0.5)]);
    }
    if (shade && i % 2 === 0) {
      inkStroke(paint, pts, noise, { wid: u.toArt(5), color: ink(0.08 * tone.line, tone.ink), noi: 0.5, salt: i });
    } else {
      inkStroke(paint, pts, noise, { wid: u.toArt(1.3), color: ink(rng.next() * 0.3 * tone.line, tone.ink), noi: 0.5, salt: i });
    }
  }
}

/**
 * Feet: small paper-white skirts flaring out where successive layers meet the ground on each side,
 * edged with a faint stroke, so the mountain sits on the land instead of floating.
 */
function feet(paint: Painter, pr: Profile, tone: Tone, rng: Rng, noise: Noise, u: Units): void {
  const G = pr.grid!;
  const L = G.length;
  const N = G[0].length;
  const fill = rgba(PAPER[0], PAPER[1], PAPER[2]);
  const m = Math.min(Math.floor(N / 8), 8);
  for (let i = 0; i < L - 1; ) {
    const ni = Math.min(L - 1, i + 1 + rng.int(2));
    for (const side of [0, 1]) {
      const at = (row: [number, number][], k: number) => row[side === 0 ? k : N - 1 - k];
      const edge: [number, number][] = [];
      for (let k = m - 1; k >= 0; k--) {
        const [x, y] = at(G[i], k);
        edge.push([x + (side === 0 ? 1 : -1) * u.toArt(8) * noise.n2(k * 0.1, i), y]);
      }
      const [ax, ay] = at(G[i], 0);
      const [bx, by] = at(G[ni], 0);
      for (let s = 0; s <= 8; s++) {
        const t = s / 8;
        const bump = -1.6 * (t - 1) * Math.pow(t, 0.2); // swells out then settles
        edge.push([ax + (bx - ax) * t, ay + (by - ay) * t + u.toArt(4) * bump + u.toArt(3) * noise.n2(i, s * 0.3)]);
      }
      paint.fillPolygon(edge, fill);
      inkStroke(paint, edge, noise, { wid: u.toArt(0.9), color: ink((0.1 + rng.next() * 0.1) * tone.line, tone.ink), noi: 0.5, salt: i * 3 + side });
    }
    i = ni;
  }
}

/** Short wavy ripple strokes under the foot, in the background plane (behind everything). */
function ripples(paint: Painter, pr: Profile, base: number, tone: Tone, rng: Rng, noise: Noise, u: Units): void {
  const cx = pr.x0 + pr.tops.length / 2;
  const len = pr.tops.length;
  let yk = -u.toArt(12);
  for (let r = 0; r < 10; r++) {
    yk += u.toArt(rng.range(0.5, 5));
    const half = len * rng.range(0.25, 0.5);
    const xk = rng.range(-0.5, 0.5) * len * 0.12;
    const pts: [number, number][] = [];
    for (let x = -half; x < half; x += u.toArt(5)) pts.push([cx + xk + x, base + yk + u.toArt(2) * Math.sin(x * 0.12) * noise.n1(x * 0.04 + r)]);
    if (pts.length > 1) inkStroke(paint, pts, noise, { wid: u.toArt(0.9), color: ink((0.3 + rng.next() * 0.3) * tone.ripple), noi: 0.5, salt: r });
  }
}
