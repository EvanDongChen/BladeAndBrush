import { createNoise } from '../../core/noise';
import { hashSeed, Rng } from '../../core/rng';
import type { Placement } from '../plan';
import type { Profile, ShapeCtx } from './registry';

/** Number of inner contour layers under the silhouette. */
const LAYERS = 5;

/**
 * Shared builder for peak-like shapes (our own formulation): a cosine hump whose two slopes are
 * warped differently, roughened by fractal noise (ruggedness = octaves + falloff + fine jag), plus
 * shrunken inner layers that later guide shading bands and texture strokes. `shapeH` can reshape
 * every height (e.g. clamp a plateau).
 */
export function mountainProfile(p: Placement, ctx: ShapeCtx, shapeH: (h: number, H: number) => number = (h) => h): Profile {
  const { u, params, base } = ctx;
  const rng = new Rng(hashSeed(p.seed, 'shape'));
  const noise = createNoise(hashSeed(p.seed, 'shape', 'noise'));
  const cx = u.toArt(p.x);
  const hw = Math.max(2, u.toArt(p.halfWidth));
  const H = u.toArt(p.height);
  const xa = Math.max(0, Math.floor(cx - hw));
  const xb = Math.min(u.artW - 1, Math.ceil(cx + hw));
  const n = Math.max(0, xb - xa + 1);

  const pL = rng.range(0.75, 1.35);
  const pR = rng.range(0.75, 1.35);
  const rugged = Math.max(1, Math.min(8, params.ruggedness));
  const octaves = Math.round(rugged);
  const falloff = 0.3 + 0.06 * rugged;
  const freq = 1 / u.toArt(120);

  const height = (x: number, scale: number, off: number) => {
    const t = (x - cx) / (hw * scale);
    if (t <= -1 || t >= 1) return 0;
    const tw = Math.sign(t) * Math.abs(t) ** (t < 0 ? pL : pR);
    const env = Math.cos((Math.PI / 2) * tw);
    const rough = noise.fbm1(x * freq + off, octaves, falloff);
    const jag = (noise.fbm1(x * freq * 4 + off + 50, octaves, falloff) - 0.5) * 0.06 * rugged;
    return Math.max(0, shapeH(H * scale * env * (0.65 + 0.7 * (rough - 0.5) + jag), H * scale));
  };

  const tops = new Float32Array(n);
  let peak = 0;
  for (let j = 0; j < n; j++) {
    const h = height(xa + j, 1, 0);
    tops[j] = h > 0 ? Math.max(0, base - h) : u.artH;
    if (tops[j] < tops[peak]) peak = j;
  }
  const layers: Float32Array[] = [];
  for (let l = 1; l <= LAYERS; l++) {
    const scale = 1 - l / (LAYERS + 1);
    const layer = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const h = height(xa + j, scale, l * 13.7);
      layer[j] = h > 0 && tops[j] < u.artH ? Math.max(tops[j], base - h) : u.artH;
    }
    layers.push(layer);
  }
  return { x0: xa, tops, layers, base, peakX: xa + peak, peakY: n > 0 ? tops[peak] : base };
}
