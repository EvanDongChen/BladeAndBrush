import { describe, expect, it } from 'vitest';
import './helpers';
import { ELEMENTS } from '../src/core/elements';

describe('FAR_ROCK', () => {
  it('is registered at id 32 and never counts for the scanner', () => {
    expect(ELEMENTS[32]?.name).toBe('far_rock');
    expect(ELEMENTS[32]?.solidForScan).toBe(false);
  });
});

import { defaultParams } from '../src/core/params';
import { artOf } from '../src/gen/artState';
import { groundTop } from '../src/gen/features/ground';
import { generate } from '../src/gen/generate';

describe('background plane', () => {
  const gen = (features: Record<string, boolean> = {}) => generate(2, defaultParams(), { k: 2, features });

  it('holds the far ridges; the physics plane never does', () => {
    const bp = gen();
    expect(bp.bg!.some((v) => v === 32)).toBe(true);
    expect(bp.el.some((v) => v === 32)).toBe(false);
  });

  it('turning far ridges off leaves the foreground identical and the bg empty', () => {
    const on = gen();
    const off = gen({ farRidges: false });
    expect(Buffer.from(off.el).equals(Buffer.from(on.el))).toBe(true);
    expect(off.bg!.every((v) => v === 0)).toBe(true);
    expect(off.art!.bg.every((v) => v === 0)).toBe(true);
  });

  it('far art is translucent everywhere, so the paper shows through it', () => {
    const bp = gen();
    let max = 0;
    let painted = 0;
    for (const c of bp.art!.bg) {
      max = Math.max(max, c >>> 24);
      if (c >>> 24) painted++;
    }
    expect(painted).toBeGreaterThan(0);
    expect(max).toBeLessThan(200);
  });
});

describe('mid row at low height', () => {
  it('has no vertical walls: the foreground skyline never jumps more than a few cells', () => {
    for (let s = 1; s <= 3; s++) {
      const bp = generate(s, { ...defaultParams(), mountainHeight: 0.2 }, { k: 2, features: { trees: false } });
      const aw = bp.w * 2;
      const ah = bp.h * 2;
      let prev = -1;
      let worst = 0;
      for (let x = 0; x < aw; x++) {
        let y = 0;
        while (y < ah && Math.max(bp.art!.planes[1][y * aw + x] >>> 24, bp.art!.planes[3][y * aw + x] >>> 24) < 128) y++;
        if (prev >= 0) worst = Math.max(worst, Math.abs(y - prev));
        prev = y;
      }
      expect(worst).toBeLessThan(12);
    }
  });
});

describe('ground bank', () => {
  it('is drawn in front of every mountain: the art just under its edge is ground', () => {
    const K = 4;
    for (let s = 1; s <= 3; s++) {
      const bp = generate(s, defaultParams(), { k: K, dims: { w: 320, h: 96 }, features: { trees: false } });
      const ground = bp.registry.strokes.get(bp.planes![1].owner[(bp.h - 1) * bp.w])!;
      const own = artOf(bp).planes[1].buf.own;
      const aw = bp.w * K;
      // The wavy top edge stays within +-K of groundTop * K, so this row is always inside the bank.
      const y = groundTop(bp.h) * K + K - 1;
      for (let x = 0; x < aw; x++) expect(own[y * aw + x]).toBe(ground.id);
    }
  });
});
