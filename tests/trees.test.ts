import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { World } from '../src/core/world';
import { scan } from '../src/gen/scan';
import './helpers';

describe('trees metric (counted by owner)', () => {
  it('two touching trees count as two', () => {
    const w = new World({ w: 10, h: 10 }, 1);
    for (let y = 2; y < 8; y++) {
      w.set(3, y, El.TREE, { owner: 5 });
      w.set(4, y, El.TREE, { owner: 6 });
    }
    expect(scan(w).counts.trees).toBe(2);
  });

  it('a tree split in two by a slash still counts once', () => {
    const w = new World({ w: 10, h: 10 }, 1);
    w.set(3, 2, El.TREE, { owner: 9 });
    w.set(3, 7, El.TREE, { owner: 9 });
    expect(scan(w).counts.trees).toBe(1);
  });

  it('a fully burnt tree stops counting', () => {
    const w = new World({ w: 10, h: 10 }, 1);
    w.set(3, 2, El.TREE, { owner: 9 });
    w.set(3, 2, El.ASH);
    expect(scan(w).counts.trees).toBe(0);
  });
});

describe('trees metric fallback', () => {
  it('unowned TREE cells count by connected blobs', () => {
    const w = new World({ w: 10, h: 10 }, 1);
    w.set(1, 1, El.TREE);
    w.set(1, 2, El.TREE);
    w.set(6, 6, El.TREE);
    expect(scan(w).counts.trees).toBe(2);
  });
});

import { createNoise } from '../src/core/noise';
import { Rng } from '../src/core/rng';
import { ArtBuffer } from '../src/gen/paint/artBuffer';
import { PixelPainter } from '../src/gen/paint/painter';
import { getSpecies } from '../src/gen/species';

describe('tree species', () => {
  const grow = (name: string, seed = 1) => {
    const buf = new ArtBuffer(200, 200, new Uint32Array(200 * 200));
    const bbox = getSpecies(name).grow({
      paint: new PixelPainter(buf),
      x: 100,
      y: 180,
      size: 60,
      owner: 3,
      rng: new Rng(seed),
      noise: createNoise(seed),
      ink: [50, 56, 50],
      k: 4,
    });
    return { buf, bbox };
  };

  for (const name of ['pine', 'round', 'tall']) {
    it(`${name}: owns pixels, all inside its bbox, near its base`, () => {
      const { buf, bbox } = grow(name);
      let owned = 0;
      for (let i = 0; i < buf.own.length; i++) {
        if (buf.own[i] !== 3) continue;
        owned++;
        const x = i % 200;
        const y = (i / 200) | 0;
        expect(x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3]).toBe(true);
      }
      expect(owned).toBeGreaterThan(60);
      expect(bbox[0]).toBeGreaterThanOrEqual(100 - 60);
      expect(bbox[2]).toBeLessThanOrEqual(100 + 60);
      expect(bbox[1]).toBeGreaterThanOrEqual(180 - 60 * 1.25);
      expect(bbox[3]).toBeLessThanOrEqual(180 + 6);
    });

    it(`${name}: deterministic`, () => {
      expect(Array.from(grow(name, 7).buf.px)).toEqual(Array.from(grow(name, 7).buf.px));
    });
  }

  it('unknown species throws', () => expect(() => getSpecies('baobab')).toThrow());
});
