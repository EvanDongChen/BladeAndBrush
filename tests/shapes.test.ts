import { describe, expect, it } from 'vitest';
import { DEFAULT_DIMS } from '../src/core/constants';
import { defaultParams } from '../src/core/params';
import type { Placement } from '../src/gen/plan';
import { getShape } from '../src/gen/shapes';
import { units } from '../src/gen/units';

const u = units(DEFAULT_DIMS, 2);
const base = u.artH - 20;
const place = (kind: string, over: Partial<Placement> = {}): Placement => ({
  kind,
  x: 1500,
  halfWidth: 300,
  height: 400,
  depth: 'near',
  seed: 5,
  ...over,
});
const ctx = { u, params: defaultParams(), base };

/** Height above the base of the highest silhouette column, in art px. */
const maxH = (tops: Float32Array) => tops.reduce((m, t) => Math.max(m, base - t), 0);

describe('peak shape', () => {
  const H = u.toArt(400);

  it('stays between the sky and its base, about as tall as asked', () => {
    const pr = getShape('peak').build(place('peak'), ctx);
    for (const t of pr.tops) {
      expect(Number.isFinite(t)).toBe(true);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(u.artH);
    }
    expect(maxH(pr.tops)).toBeLessThanOrEqual(1.2 * H);
    expect(maxH(pr.tops)).toBeGreaterThan(0.5 * H);
    expect(pr.tops[pr.peakX - pr.x0]).toBe(pr.peakY);
  });

  it('inner layers never rise above the silhouette', () => {
    const pr = getShape('peak').build(place('peak'), ctx);
    expect(pr.layers.length).toBeGreaterThanOrEqual(3);
    for (const layer of pr.layers) {
      expect(layer.length).toBe(pr.tops.length);
      for (let j = 0; j < layer.length; j++) if (layer[j] < u.artH) expect(layer[j]).toBeGreaterThanOrEqual(pr.tops[j]);
    }
  });

  it('is deterministic and depends on the placement seed', () => {
    const a = getShape('peak').build(place('peak'), ctx);
    expect(Array.from(getShape('peak').build(place('peak'), ctx).tops)).toEqual(Array.from(a.tops));
    expect(Array.from(getShape('peak').build(place('peak', { seed: 6 }), ctx).tops)).not.toEqual(Array.from(a.tops));
  });

  it('clips at the scroll edge', () => {
    const pr = getShape('peak').build(place('peak', { x: 0 }), ctx);
    expect(pr.x0).toBe(0);
    expect(pr.x0 + pr.tops.length).toBeLessThanOrEqual(u.artW);
  });
});

describe('flat shape', () => {
  it('has a clamped top', () => {
    const H = u.toArt(400);
    for (let s = 1; s <= 5; s++) expect(maxH(getShape('flat').build(place('flat', { seed: s }), ctx).tops)).toBeLessThanOrEqual(0.69 * H * 1.35);
  });
});

describe('shape registry', () => {
  it('throws on an unknown shape', () => expect(() => getShape('nope')).toThrow());
});
