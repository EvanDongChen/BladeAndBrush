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
  /** A variable-width ink stroke along a path in art pixels. Decoration only: claims no owner. */
  stroke(path: ArrayLike<readonly [number, number]>, brush: Brush, noise?: Noise): void;
}

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

  stroke(path: ArrayLike<readonly [number, number]>, brush: Brush, noise?: Noise): void {
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
        if (c > 0) this.buf.blend(y * this.buf.w + x, (rgb | (Math.round(alpha * c) << 24)) >>> 0);
      }
    }
  }
}
