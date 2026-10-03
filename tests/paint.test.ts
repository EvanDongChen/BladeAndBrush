import { describe, expect, it } from 'vitest';
import { rgba } from '../src/core/elements';
import { createNoise } from '../src/core/noise';
import { ArtBuffer } from '../src/gen/paint/artBuffer';
import { PixelPainter } from '../src/gen/paint/painter';
import { inkWash } from '../src/gen/paint/shaders';
import { units } from '../src/gen/units';

const A = (c: number) => c >>> 24;
const buf = (w: number, h: number) => new ArtBuffer(w, h, new Uint32Array(w * h));

describe('units', () => {
  it('960x256 is a 3000x800 scroll', () => {
    const u = units({ w: 960, h: 256 }, 4);
    expect(u.widthUnits).toBe(3000);
    expect(u.toCell(800)).toBe(256);
    expect(u.toArt(800)).toBe(1024);
    expect(u.artW).toBe(3840);
  });
});

describe('PixelPainter.fillColumns', () => {
  it('fills between top and bottom, marks owner, soft top edge', () => {
    const b = buf(4, 10);
    const p = new PixelPainter(b);
    p.fillColumns(1, [2.5, 4], 10, () => rgba(0, 0, 0), 7);
    expect(b.own[3 * 4 + 1]).toBe(7); // full pixel under top
    expect(A(b.px[2 * 4 + 1])).toBeGreaterThan(100); // half pixel: partial alpha
    expect(A(b.px[2 * 4 + 1])).toBeLessThan(160);
    expect(b.own[2 * 4 + 1]).toBe(7); // half covered counts (>= 0.5)
    expect(b.own[3 * 4 + 2]).toBe(0); // above top of column 2
    expect(b.own[4 * 4 + 2]).toBe(7);
    expect(b.px[5 * 4 + 0]).toBe(0); // column 0 untouched
  });

  it('supports per-column bottoms', () => {
    const b = buf(2, 10);
    new PixelPainter(b).fillColumns(0, [2], [5], () => rgba(0, 0, 0), 1);
    expect(b.own[4 * 2]).toBe(1);
    expect(b.own[5 * 2]).toBe(0);
  });
});

describe('PixelPainter.stroke', () => {
  it('inks along the path, not far away, and overlaps never exceed the brush alpha', () => {
    const b = buf(40, 20);
    const color = rgba(0, 0, 0, 100);
    new PixelPainter(b).stroke(
      [
        [5, 10],
        [35, 10],
      ],
      { width: 3, color, taper: 0 },
    );
    expect(A(b.px[10 * 40 + 20])).toBe(100);
    expect(b.px[2 * 40 + 20]).toBe(0);
    let max = 0;
    for (const c of b.px) max = Math.max(max, A(c));
    expect(max).toBeLessThanOrEqual(100);
  });

  it('is deterministic', () => {
    const run = () => {
      const b = buf(40, 20);
      new PixelPainter(b).stroke(
        [
          [5, 5],
          [20, 15],
          [35, 5],
        ],
        { width: 4, color: rgba(0, 0, 0, 200), noise: 0.5 },
        createNoise(3),
      );
      return Array.from(b.px);
    };
    expect(run()).toEqual(run());
  });
});

describe('inkWash', () => {
  it('is opaque and darker at the edge than deep inside', () => {
    const s = inkWash({ ink: [40, 40, 40], base: 0.2, edge: 0.6, edgeWidth: 4, speckle: 0, noise: createNoise(1) });
    expect(A(s(0, 0, 0))).toBe(255);
    expect(s(0, 0, 0) & 255).toBeLessThan(s(0, 0, 50) & 255);
  });
});
