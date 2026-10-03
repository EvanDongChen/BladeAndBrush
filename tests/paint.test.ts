import { describe, expect, it } from 'vitest';
import { createBlueprint } from '../src/core/blueprint';
import { El, rgba } from '../src/core/elements';
import { createNoise } from '../src/core/noise';
import { defaultParams } from '../src/core/params';
import { attachArt } from '../src/gen/artState';
import { ArtBuffer } from '../src/gen/paint/artBuffer';
import { PixelPainter } from '../src/gen/paint/painter';
import { inkWash } from '../src/gen/paint/shaders';
import { rasterizeCoverage } from '../src/gen/raster';
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

describe('rasterizeCoverage', () => {
  it('sets cells whose k x k block is at least half owned', () => {
    const bp = createBlueprint(1, defaultParams(), { w: 3, h: 1 });
    const { fg } = attachArt(bp, 2);
    // art is 6 x 2; cell c covers columns 2c..2c+1 of both rows
    fg.own[0] = 5;
    fg.own[1] = 5; // cell 0: 2 of 4 -> set
    fg.own[2] = 5; // cell 1: 1 of 4 -> not set
    fg.own[4] = 5;
    fg.own[5] = 5;
    fg.own[10] = 5; // cell 2: 3 of 4 -> set
    const bb = rasterizeCoverage(bp, fg, 2, 5, El.ROCK, bp, [0, 0, 2, 0], false);
    expect(Array.from(bp.el)).toEqual([El.ROCK, El.EMPTY, El.ROCK]);
    expect(bp.owner[2]).toBe(5);
    expect(bb).toEqual([0, 0, 2, 0]);
  });

  it('does not overwrite a filled cell unless asked', () => {
    const bp = createBlueprint(1, defaultParams(), { w: 1, h: 1 });
    const { fg } = attachArt(bp, 1);
    bp.el[0] = El.ROCK;
    fg.own[0] = 9;
    expect(rasterizeCoverage(bp, fg, 1, 9, El.TREE, bp, [0, 0, 0, 0], false)).toBeNull();
    expect(bp.el[0]).toBe(El.ROCK);
    rasterizeCoverage(bp, fg, 1, 9, El.TREE, bp, [0, 0, 0, 0], true);
    expect(bp.el[0]).toBe(El.TREE);
  });
});

describe('mist', () => {
  it('contourWash fades toward paper near the foot, staying opaque', async () => {
    const { contourWash } = await import('../src/gen/paint/shaders');
    const s = contourWash({
      ink: [40, 40, 40], base: 0.5, edge: 0, edgeWidth: 1, band: 0, bandWidth: 1, speckle: 0,
      noise: createNoise(1), x0: 0, layers: [], mist: { from: 100, to: 200 },
    });
    expect(A(s(0, 190, 50))).toBe(255);
    expect(s(0, 190, 50) & 255).toBeGreaterThan(s(0, 110, 50) & 255);
  });

  it('farWash becomes transparent toward the foot', async () => {
    const { farWash } = await import('../src/gen/paint/shaders');
    const s = farWash({ ink: [120, 120, 120], strength: 0.5, edge: 0.2, edgeWidth: 4, noise: createNoise(1), fadeFrom: 100, fadeTo: 200 });
    expect(A(s(0, 50, 10))).toBeGreaterThan(A(s(0, 180, 10)));
    expect(A(s(0, 200, 10))).toBe(0);
  });
});
