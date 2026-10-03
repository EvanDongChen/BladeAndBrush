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
