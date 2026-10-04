import type { Blueprint } from '../../core/blueprint';
import { rgba } from '../../core/elements';
import type { Noise } from '../../core/noise';
import type { Rng } from '../../core/rng';
import { artOf, PLANE } from '../artState';
import { rasterizeCoverage } from '../raster';
import { elementId } from '../setpieceKit';
import { ink, inkStroke } from './strokes';

/**
 * One shan-shui cloud: a long low band of paper white with a scalloped top (a row of round lobes)
 * and a flatter, faintly shaded underside, its lobes outlined in pale ink. Painted in the mid
 * objects plane (in front of the far mountains, behind the near ones) with CLOUD cells under it.
 * Centre (cx, cy) and half sizes in cells. Returns the cloud's object id, or 0 if nothing was made.
 */
export function paintCloud(
  bp: Blueprint,
  newStroke: (info: { kind: string; bbox: [number, number, number, number]; anchor: [number, number]; tags?: string[] }) => number,
  rng: Rng,
  noise: Noise,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
): number {
  const cloud = elementId('cloud');
  if (cloud === 0) return 0;
  const { planes, u } = artOf(bp);
  const plane = planes[PLANE.MID_OBJ];
  const K = u.k;
  const id = newStroke({ kind: 'cloud', bbox: [0, 0, 0, 0], anchor: [Math.round(cx), Math.round(cy)], tags: ['cloud'] });

  const ax = cx * K;
  const ay = cy * K;
  const hw = halfW * K;
  const hh = halfH * K;
  // lobes along the top: bigger in the middle
  const lobes: { x: number; r: number }[] = [];
  const n = 3 + rng.int(4);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const x = ax - hw + 2 * hw * t + rng.range(-0.3, 0.3) * (hw / n);
    lobes.push({ x, r: hh * (0.45 + 0.6 * Math.sin(Math.PI * t)) * rng.range(0.8, 1.15) });
  }
  const x0 = Math.floor(ax - hw);
  const cols = Math.ceil(2 * hw) + 1;
  const tops = new Float32Array(cols);
  const bots = new Float32Array(cols);
  for (let j = 0; j < cols; j++) {
    const x = x0 + j + 0.5;
    const t = (x - ax) / hw;
    const env = t * t < 1 ? Math.sqrt(1 - t * t) : 0;
    let lift = 0;
    for (const l of lobes) {
      const d = (x - l.x) / l.r;
      if (d * d < 1) lift = Math.max(lift, l.r * Math.sqrt(1 - d * d));
    }
    tops[j] = env > 0 ? ay - hh * 0.25 * env - lift * Math.min(1, env * 2.5) : Infinity;
    bots[j] = env > 0 ? ay + hh * (0.3 + 0.08 * noise.n1(x * 0.05)) * env : -Infinity;
  }
  const white: [number, number, number] = [247, 244, 236];
  const shade: [number, number, number] = [208, 208, 206];
  plane.paint.fillColumns(
    x0,
    tops,
    bots,
    (_x, y) => {
      const f = Math.max(0, Math.min(1, (y - (ay - hh * 0.2)) / (hh * 0.6))); // shaded toward the underside
      const c = (k: number) => Math.round(white[k] + (shade[k] - white[k]) * f * 0.6);
      return rgba(c(0), c(1), c(2), 238);
    },
    id,
  );
  // pale ink along each lobe's top, and a long faint line under the band
  for (const l of lobes) {
    const arc: [number, number][] = [];
    for (let s = 0; s <= 16; s++) {
      const a = Math.PI * (1 - s / 16);
      const x = l.x + Math.cos(a) * l.r;
      const j = Math.max(0, Math.min(cols - 1, Math.round(x - x0)));
      if (Number.isFinite(tops[j]) && Math.abs(ay - Math.sin(a) * l.r - hh * 0.25 - tops[j]) < l.r) arc.push([x, tops[j]]);
    }
    if (arc.length > 1) inkStroke(plane.paint, arc, noise, { wid: u.toArt(1.1), color: ink(0.22), noi: 0.5, salt: l.x });
  }
  const under: [number, number][] = [];
  for (let j = Math.floor(cols * 0.1); j < cols * 0.9; j += 3) if (Number.isFinite(bots[j])) under.push([x0 + j, bots[j] - K * 0.3]);
  if (under.length > 1) inkStroke(plane.paint, under, noise, { wid: u.toArt(0.8), color: ink(0.12), noi: 0.6, salt: id });

  const cells = rasterizeCoverage(bp, plane.buf, K, id, cloud, plane.grid, [Math.floor(cx - halfW) - 1, Math.floor(cy - halfH * 2) - 1, Math.ceil(cx + halfW) + 1, Math.ceil(cy + halfH) + 1], false);
  const info = bp.registry.strokes.get(id);
  if (!cells) {
    bp.registry.strokes.delete(id);
    return 0;
  }
  if (info) info.bbox = cells;
  return id;
}
