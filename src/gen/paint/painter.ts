import type { Noise } from '../../core/noise';
import type { ArtBuffer } from './artBuffer';

/** Color for art pixel (x, y); dTop = distance in art pixels below the shape's top edge. */
export type Shader = (x: number, y: number, dTop: number) => number;

export interface Brush {
  /** Max half-width in art pixels. */
  width: number;
  /** Packed RGBA; its alpha is the stroke's max opacity. */
  color: number;
  /** 0..1: how much noise modulates the width. */
  noise?: number;
  /** 0 = constant width, 1 = full swell-and-taper (default 1). */
  taper?: number;
}

/**
 * Everything features paint goes through this, so the pixel implementation can later be swapped
 * for a vector or chunked one with the same calls.
 */
export interface Painter {
  /** Fill art columns x0.. from tops[j] (fractional) down to bottoms[j] (or one shared bottom). */
  fillColumns(x0: number, tops: ArrayLike<number>, bottoms: ArrayLike<number> | number, shader: Shader, owner: number): void;
  /**
   * A variable-width ink stroke along a path in art pixels. Decoration unless `owner` is given;
   * then pixels at least half covered are claimed for it (e.g. a tree's trunk and needles).
   */
  stroke(path: ArrayLike<readonly [number, number]>, brush: Brush, noise?: Noise, owner?: number): void;
  /** Fill any closed polygon (even-odd), anti-aliased. Claims pixels at coverage >= 1/2 for `owner`. */
  fillPolygon(pts: ArrayLike<readonly [number, number]>, color: Shader | number, owner?: number): void;
}

/** Vertical sub-samples per pixel row for polygon anti-aliasing. */
const SUB = 4;
let covScratch = new Float32Array(1024);

export class PixelPainter implements Painter {
  constructor(readonly buf: ArtBuffer) {}

  fillColumns(x0: number, tops: ArrayLike<number>, bottoms: ArrayLike<number> | number, shader: Shader, owner: number): void {
    const { w, h } = this.buf;
    for (let j = 0; j < tops.length; j++) {
      const x = x0 + j;
      if (x < 0 || x >= w) continue;
      const top = Math.max(0, tops[j]);
      const bottom = Math.min(h, typeof bottoms === 'number' ? bottoms : bottoms[j]);
      if (bottom <= top) continue;
      const yTop = Math.floor(top);
      const frac = 1 - (top - yTop); // coverage of the partial top pixel
      const { px, own } = this.buf;
      const yEnd = Math.ceil(bottom);
      for (let y = yTop; y < yEnd; y++) {
        const c = shader(x, y, y + 0.5 - top);
        const i = y * w + x;
        if (y !== yTop && c >>> 24 === 255) {
          // Hot path: fully covered, opaque -> plain write.
          px[i] = c;
          own[i] = owner;
          continue;
        }
        const cov = y === yTop ? frac : 1;
        const a = Math.round((c >>> 24) * cov);
        this.buf.blend(i, ((c & 0xffffff) | (a << 24)) >>> 0, cov >= 0.5 ? owner : undefined);
      }
    }
  }

  fillPolygon(pts: ArrayLike<readonly [number, number]>, color: Shader | number, owner?: number): void {
    const n = pts.length;
    if (n < 3) return;
    const { w, h } = this.buf;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i];
      if (!(x === x && y === y)) return; // NaN guard
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const x0 = Math.max(0, Math.floor(minX));
    const x1 = Math.min(w - 1, Math.ceil(maxX));
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(h - 1, Math.ceil(maxY));
    if (x1 < x0 || y1 < y0) return;
    const bw = x1 - x0 + 1;
    if (covScratch.length < bw) covScratch = new Float32Array(bw * 2);
    const cov = covScratch;
    const xs: number[] = [];
    const shader = typeof color === 'number' ? null : color;
    for (let y = y0; y <= y1; y++) {
      cov.fill(0, 0, bw);
      let any = false;
      for (let s = 0; s < SUB; s++) {
        const sy = y + (s + 0.5) / SUB;
        xs.length = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const ay = pts[i][1];
          const by = pts[j][1];
          if (ay > sy === by > sy) continue;
          xs.push(pts[i][0] + ((sy - ay) / (by - ay)) * (pts[j][0] - pts[i][0]));
        }
        if (xs.length < 2) continue;
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const a = Math.max(x0, xs[k]);
          const b = Math.min(x1 + 1, xs[k + 1]);
          if (b <= a) continue;
          any = true;
          const ia = Math.floor(a);
          const ib = Math.floor(b);
          if (ia === ib) {
            cov[ia - x0] += (b - a) / SUB;
            continue;
          }
          cov[ia - x0] += (ia + 1 - a) / SUB;
          for (let x = ia + 1; x < ib; x++) cov[x - x0] += 1 / SUB;
          if (ib <= x1) cov[ib - x0] += (b - ib) / SUB;
        }
      }
      if (!any) continue;
      for (let x = x0; x <= x1; x++) {
        const c = Math.min(1, cov[x - x0]);
        if (c <= 0.002) continue;
        const col = shader ? shader(x, y, y - minY) : (color as number);
        const a = Math.round((col >>> 24) * c);
        if (a === 0 && !(owner !== undefined && c >= 0.5)) continue;
        this.buf.blend(y * w + x, ((col & 0xffffff) | (a << 24)) >>> 0, owner !== undefined && c >= 0.5 ? owner : undefined);
      }
    }
  }

  stroke(path: ArrayLike<readonly [number, number]>, brush: Brush, noise?: Noise, owner?: number): void {
    const n = path.length;
    if (n < 2) return;
    const taper = brush.taper ?? 1;
    const nz = brush.noise ?? 0;

    // Bounding box of the stroke, padded by the width.
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, path[i][0]);
      x1 = Math.max(x1, path[i][0]);
      y0 = Math.min(y0, path[i][1]);
      y1 = Math.max(y1, path[i][1]);
    }
    const pad = Math.ceil(brush.width) + 2;
    const bx = Math.max(0, Math.floor(x0) - pad);
    const by = Math.max(0, Math.floor(y0) - pad);
    const ex = Math.min(this.buf.w - 1, Math.ceil(x1) + pad);
    const ey = Math.min(this.buf.h - 1, Math.ceil(y1) + pad);
    if (ex < bx || ey < by) return;
    const bw = ex - bx + 1;

    // Max coverage per pixel, so overlapping stamps never darken the stroke beyond its alpha.
    const cov = new Float32Array(bw * (ey - by + 1));
    let total = 0;
    for (let i = 1; i < n; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    let walked = 0;
    for (let i = 1; i < n; i++) {
      const [ax, ay] = path[i - 1];
      const [qx, qy] = path[i];
      const len = Math.hypot(qx - ax, qy - ay);
      const steps = Math.max(1, Math.ceil(len * 2)); // a stamp every half pixel
      for (let s = 0; s <= steps; s++) {
        const t = Math.min(1, Math.max(0, (walked + (len * s) / steps) / (total || 1)));
        let r = brush.width * (1 - taper + taper * Math.sin(Math.PI * t));
        if (noise && nz > 0) r *= 1 - nz + nz * noise.n1(t * total * 0.15);
        const cx = ax + ((qx - ax) * s) / steps;
        const cy = ay + ((qy - ay) * s) / steps;
        const xa = Math.max(bx, Math.floor(cx - r - 1));
        const xb = Math.min(ex, Math.ceil(cx + r + 1));
        const ya = Math.max(by, Math.floor(cy - r - 1));
        const yb = Math.min(ey, Math.ceil(cy + r + 1));
        for (let y = ya; y <= yb; y++) {
          for (let x = xa; x <= xb; x++) {
            const c = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
            const k = (y - by) * bw + (x - bx);
            if (c > cov[k]) cov[k] = c;
          }
        }
      }
      walked += len;
    }

    const alpha = brush.color >>> 24;
    const rgb = brush.color & 0xffffff;
    for (let y = by; y <= ey; y++) {
      for (let x = bx; x <= ex; x++) {
        const c = cov[(y - by) * bw + (x - bx)];
        if (c > 0) this.buf.blend(y * this.buf.w + x, (rgb | (Math.round(alpha * c) << 24)) >>> 0, c >= 0.5 ? owner : undefined);
      }
    }
  }
}
