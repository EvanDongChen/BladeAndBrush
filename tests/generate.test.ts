import { describe, expect, it } from 'vitest';
import { hashBlueprint } from '../src/core/blueprint';
import { featureToggles } from '../src/core/config';
import { Flag } from '../src/core/constants';
import { El } from '../src/core/elements';
import { defaultParams } from '../src/core/params';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { enabledFeatures, generate } from '../src/gen/generate';
import { scan } from '../src/gen/scan';
import './helpers';

const count = (a: Uint8Array, el: number) => a.reduce((n, v) => n + (v === el ? 1 : 0), 0);

describe('stub generate()', () => {
  it('is deterministic for the same seed and params', () => {
    const p = defaultParams();
    expect(hashBlueprint(generate(42, p))).toBe(hashBlueprint(generate(42, p)));
    expect(hashBlueprint(generate(42, p))).not.toBe(hashBlueprint(generate(43, p)));
  });

  it('draws ground, rock bumps and trees with registry entries', () => {
    const bp = generate(1, defaultParams());
    expect(count(bp.el, El.ROCK)).toBeGreaterThan(bp.w * 5);
    expect(count(bp.el, El.TREE)).toBeGreaterThan(0);
    const kinds = [...bp.registry.strokes.values()].map((s) => s.kind);
    expect(kinds).toContain('mountain');
    expect(kinds).toContain('tree');
    // every owned cell belongs to a registered stroke
    const owners = new Set(bp.owner);
    owners.delete(0);
    expect([...owners].filter((id) => !bp.registry.strokes.has(id))).toEqual([]);
  });

  it('params change the painting', () => {
    const lo = generate(1, { ...defaultParams(), treeDensity: 0.1 });
    const hi = generate(1, { ...defaultParams(), treeDensity: 0.9 });
    expect(count(hi.el, El.TREE)).toBeGreaterThan(count(lo.el, El.TREE));
  });

  it('disabling a feature flag removes that feature from the pipeline with no errors', () => {
    expect(enabledFeatures().map((f) => f.name)).toContain('stubTrees');
    featureToggles.stubTrees = false;
    try {
      expect(enabledFeatures().map((f) => f.name)).not.toContain('stubTrees');
      const bp = generate(1, defaultParams());
      expect(count(bp.el, El.TREE)).toBe(0);
      expect(count(bp.el, El.ROCK)).toBeGreaterThan(0);
    } finally {
      delete featureToggles.stubTrees;
    }
    // per-call overrides work the same way
    expect(count(generate(1, defaultParams(), { features: { stubBumps: false } }).el, El.TREE)).toBeGreaterThan(0);
  });
});

describe('Frontier', () => {
  it('reveals the blueprint left to right', () => {
    const bp = generate(5, defaultParams());
    const world = new World(bp, 5);
    const f = new Frontier(bp, 10);
    f.advance(world);
    f.advance(world);
    expect(f.x).toBe(20);
    let mismatches = 0;
    for (let y = 0; y < bp.h; y++) {
      for (let x = 0; x < bp.w; x++) {
        const i = y * bp.w + x;
        if (world.el[i] !== (x < 20 ? bp.el[i] : El.EMPTY)) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
    f.revealAll(world);
    expect(f.done).toBe(true);
    expect(Buffer.from(world.el).equals(Buffer.from(bp.el))).toBe(true);
  });

  it('skips CUT cells (slashed ahead of the frontier)', () => {
    const bp = generate(5, defaultParams());
    const world = new World(bp, 5);
    const y = bp.h - 1; // ground row, always rock
    world.set(500, y, El.EMPTY, { cut: true });
    new Frontier(bp).revealAll(world);
    expect(world.get(500, y)).toBe(El.EMPTY);
    expect(world.get(501, y)).toBe(El.ROCK);
    expect(world.flags[world.idx(501, y)] & Flag.GENERATED).toBe(Flag.GENERATED);
  });

  it('scan counts every stub tree', () => {
    const bp = generate(9, defaultParams());
    const world = new World(bp, 9);
    new Frontier(bp).revealAll(world);
    const trees = [...bp.registry.strokes.values()].filter((s) => s.kind === 'tree').length;
    expect(scan(world).counts.trees).toBe(trees);
  });
});
