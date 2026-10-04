import type { Noise } from '../../core/noise';
import type { Rng } from '../../core/rng';
import { rgba } from '../../core/elements';
import type { PixelPainter } from './painter';

/**
 * Sparse wavy horizontal strokes across a band, the way flat land and water are drawn in ink
 * paintings: a few long lines that thin out, never a fill. `top`/`bottom` are art y rows.
 */
export function hatch(
  paint: PixelPainter,
  rng: Rng,
  noise: Noise,
  o: { x0: number; x1: number; top: number; bottom: number; count: number; ink: [number, number, number]; alpha: number; width: number; wave: number },
): void {
  for (let n = 0; n < o.count; n++) {
    const y = o.top + (o.bottom - o.top) * Math.pow(rng.next(), 0.8);
    const len = (o.x1 - o.x0) * rng.range(0.06, 0.3);
    const xs = o.x0 + rng.next() * Math.max(1, o.x1 - o.x0 - len);
    const pts: [number, number][] = [];
    for (let x = 0; x <= len; x += 6) pts.push([xs + x, y + o.wave * (noise.n1((xs + x) / 90 + n * 3.1) - 0.5)]);
    if (pts.length > 1) paint.stroke(pts, { width: o.width, color: rgba(o.ink[0], o.ink[1], o.ink[2], o.alpha), noise: 0.5 }, noise);
  }
}
