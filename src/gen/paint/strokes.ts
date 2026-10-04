import { rgba } from '../../core/elements';
import type { Noise } from '../../core/noise';
import type { Painter } from './painter';

/** The neutral ink every line is drawn in (alpha varies). */
export const INK: [number, number, number] = [100, 100, 100];

export const ink = (alpha: number, c: [number, number, number] = INK) => rgba(c[0], c[1], c[2], Math.max(0, Math.min(255, Math.round(alpha * 255))));

export interface InkStrokeOpts {
  /** Half-width at the widest point, art px. */
  wid: number;
  /** Packed RGBA. */
  color: number;
  /** 0..1: how much noise thins/thickens the line. */
  noi?: number;
  /** Width profile along the line, t in 0..1 (default: swell in the middle, taper at both ends). */
  widthFn?: (t: number) => number;
  /** Claim the covered pixels for this owner. */
  owner?: number;
  /** Noise seed offset so different strokes vary differently. */
  salt?: number;
}

/**
 * A brush line as a filled outline: each point is pushed out to both sides along the bisector of
 * its neighbours by the local half-width, and the two sides are joined into one polygon.
 */
export function inkStroke(paint: Painter, pts: ArrayLike<readonly [number, number]>, noise: Noise, o: InkStrokeOpts): void {
  const n = pts.length;
  if (n < 2) return;
  const fn = o.widthFn ?? ((t: number) => Math.sin(t * Math.PI));
  const noi = o.noi ?? 0.5;
  const salt = o.salt ?? 0;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    let wv = o.wid * fn(i / (n - 1));
    if (noi > 0) wv *= 1 - noi + noi * 2 * noise.n2(i * 0.5, salt + 7.3);
    // normal = (-dy, dx)
    left.push([p[0] - dy * wv, p[1] + dx * wv]);
    right.push([p[0] + dy * wv, p[1] - dx * wv]);
  }
  const poly = left.concat(right.reverse());
  paint.fillPolygon(poly, o.color, o.owner);
}

export interface BlobOpts {
  /** Full length and width, art px. */
  len: number;
  wid: number;
  /** Rotation, radians (0 = along +x). */
  ang?: number;
  color: number;
  /** 0..1: how ragged the outline is. */
  noi?: number;
  owner?: number;
  salt?: number;
  /** 0 = plain ellipse, 1 = pointed leaf ends. */
  point?: number;
}

/** A soft leaf / foliage dab: a noisy ellipse, optionally pointed at the ends. */
export function blob(paint: Painter, x: number, y: number, noise: Noise, o: BlobOpts): void {
  const N = 22;
  const ang = o.ang ?? 0;
  const noi = o.noi ?? 0.5;
  const point = o.point ?? 0.6;
  const salt = o.salt ?? 0;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    // noise sampled around a circle loops back on itself, so the outline closes smoothly
    const r = 1 - noi + noi * 1.6 * noise.n2(c * 1.3 + salt, s * 1.3 + salt * 0.7);
    const sy = Math.sign(s) * Math.pow(Math.abs(s), 1 - 0.5 * point);
    const lx = (c * o.len) / 2;
    const ly = (sy * o.wid) / 2;
    pts.push([x + (lx * ca - ly * sa) * r, y + (lx * sa + ly * ca) * r]);
  }
  paint.fillPolygon(pts, o.color, o.owner);
}
