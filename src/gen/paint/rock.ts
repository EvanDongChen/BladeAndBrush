import { rgba } from '../../core/elements';
import type { Noise } from '../../core/noise';
import type { Rng } from '../../core/rng';
import type { Painter } from './painter';
import { ink, inkStroke } from './strokes';

const PAPER = rgba(241, 235, 220);

/**
 * A boulder: nested rings (outer = outline), each a noisy ellipse whose lower half is squashed
 * flat so it sits on the ground, shrinking and settling inward. Paper-white fill (claimed for
 * `owner`), a faint broken outline, and light texture strokes on its upper left and right shoulders.
 * (x, y) is where it touches the ground. Returns its art bbox.
 */
export function paintRock(
  paint: Painter,
  x: number,
  y: number,
  wid: number,
  hei: number,
  owner: number,
  rng: Rng,
  noise: Noise,
  lineW: number,
  inkRGB: [number, number, number] = [100, 100, 100],
): [number, number, number, number] {
  const L = 6;
  const N = 36;
  const salt = rng.range(0, 100);
  const rings: [number, number][][] = [];
  for (let i = 0; i < L; i++) {
    const p = 1 - i / L;
    const ring: [number, number][] = [];
    for (let j = 0; j < N; j++) {
      const a = (j / N) * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const ell = (wid * hei) / Math.sqrt((hei * c) ** 2 + (wid * s) ** 2);
      const r = ell * (0.7 + 0.3 * noise.n2(c * 1.4 + salt + i, s * 1.4 + salt));
      let ny = -s * r * p;
      if (s < 0) ny *= 0.2; // the underside is flat on the ground
      ring.push([x + c * r * p, y + ny + hei * (i / L) * 0.2]);
    }
    rings.push(ring);
  }
  paint.fillPolygon(rings[0], PAPER, owner);
  inkStroke(paint, rings[0].concat([rings[0][0]]), noise, { wid: lineW * 1.3, color: ink(0.5, inkRGB), noi: 1, widthFn: () => 1, salt });
  const count = 14 + Math.round((wid / lineW) * 0.6);
  for (let k = 0; k < count; k++) {
    const ring = rings[Math.min(L - 1, Math.floor((k / count) * (L - 1)))];
    const side = rng.chance(0.5) ? rng.range(0.15, 0.3) : rng.range(0.7, 0.85); // upper shoulders
    const mid = Math.floor(side * N);
    const half = 1 + rng.int(Math.max(2, Math.floor(N * 0.12)));
    const pts: [number, number][] = [];
    for (let j = mid - half; j <= mid + half; j++) pts.push(ring[(j + N) % N]);
    inkStroke(paint, pts, noise, { wid: lineW, color: ink(rng.range(0.25, 0.5), [140, 140, 140]), noi: 0.5, salt: k });
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [px, py] of rings[0]) {
    x0 = Math.min(x0, px);
    x1 = Math.max(x1, px);
    y0 = Math.min(y0, py);
    y1 = Math.max(y1, py);
  }
  return [x0, y0, x1, y1];
}
