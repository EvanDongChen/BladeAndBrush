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
    expect(hashBlueprint(generate(42, p, { k: 1 }))).toBe(hashBlueprint(generate(42, p, { k: 1 })));
    expect(hashBlueprint(generate(42, p, { k: 1 }))).not.toBe(hashBlueprint(generate(43, p, { k: 1 })));
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
    expect(enabledFeatures().map((f) => f.name)).toContain('trees');
    featureToggles.trees = false;
    featureToggles.plateaus = false; // the plateau scenes plant trees too
    try {
      expect(enabledFeatures().map((f) => f.name)).not.toContain('trees');
      const bp = generate(1, defaultParams());
      expect(count(bp.el, El.TREE)).toBe(0);
      expect(count(bp.el, El.ROCK)).toBeGreaterThan(0);
    } finally {
      delete featureToggles.trees;
      delete featureToggles.plateaus;
    }
    // per-call overrides work the same way
    const noMountains = generate(1, defaultParams(), { features: { mountains: false } });
    expect([...noMountains.registry.strokes.values()].some((q) => q.kind === 'mountain')).toBe(false);
  });
});

describe('Frontier', () => {
  it('reveals the blueprint left to right', () => {
    const bp = generate(5, defaultParams(), { features: { life: false } }); // life is placed by the sim, not in the blueprint
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
    // any rock cell with rock to its right
    let i = 0;
    while (i < bp.el.length - 1 && !(bp.el[i] === El.ROCK && bp.el[i + 1] === El.ROCK && (i % bp.w) < bp.w - 1)) i++;
    const x = i % bp.w;
    const y = (i / bp.w) | 0;
    world.set(x, y, El.EMPTY, { cut: true });
    new Frontier(bp).revealAll(world);
    expect(world.get(x, y)).toBe(El.EMPTY);
    expect(world.get(x + 1, y)).toBe(El.ROCK);
    expect(world.flags[world.idx(x + 1, y)] & Flag.GENERATED).toBe(Flag.GENERATED);
  });

  it('scan counts the trees in front of their terrain', () => {
    const bp = generate(9, defaultParams());
    const world = new World(bp, 9);
    new Frontier(bp).revealAll(world);
    const visible = new Set<number>();
    for (let i = 0; i < bp.el.length; i++) if (bp.el[i] === El.TREE) visible.add(bp.owner[i]);
    expect(scan(world).counts.trees).toBe(visible.size);
    expect(visible.size).toBeGreaterThan(0);
  });
});

describe('art pipeline', () => {
  it('every cell in a plane is at least half covered in that plane\'s art, and the art is painted', () => {
    const bp = generate(3, defaultParams(), { k: 2 });
    const art = bp.art!;
    const k = art.k;
    const aw = bp.w * k;
    let painted = 0;
    for (const plane of art.planes) for (const c of plane) if (c >>> 24) painted++;
    expect(painted).toBeGreaterThan(bp.w * k * k * 5);
    let bad = 0;
    bp.planes!.forEach((grid, q) => {
      for (let i = 0; i < grid.el.length; i++) {
        if (grid.el[i] === El.EMPTY) continue;
        const x = i % bp.w;
        const y = (i / bp.w) | 0;
        let opaque = 0;
        for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) if (art.planes[q][(y * k + yy) * aw + x * k + xx] >>> 24) opaque++;
        if (opaque < Math.ceil((k * k) / 2)) bad++;
      }
    });
    expect(bad).toBe(0);
  });

  it('flattens the planes into a front cell plus a compact stack behind it', () => {
    const bp = generate(3, defaultParams(), { k: 1 });
    for (let i = 0; i < bp.el.length; i++) {
      const stack = bp.planes!.map((g, q) => [g.el[i], q] as const).filter(([e]) => e !== El.EMPTY);
      expect(bp.el[i]).toBe(stack[0]?.[0] ?? El.EMPTY);
      stack.slice(1).forEach(([e, q], d) => {
        expect(bp.behind![d].el[i]).toBe(e);
        expect(bp.behind![d].plane[i]).toBe(q);
      });
    }
  });
});

describe('mountains', () => {
  const k = 2;
  /** Mean column height of the blueprint's solid cells (cells above the ground bank count). */
  const heights = (bp: ReturnType<typeof generate>) => {
    const out: number[] = [];
    for (let x = 0; x < bp.w; x++) {
      let y = 0;
      while (y < bp.h && bp.el[y * bp.w + x] === El.EMPTY) y++;
      out.push(bp.h - y);
    }
    return out;
  };
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const wiggle = (a: number[]) => a.slice(1).reduce((s, v, i) => s + Math.abs(v - a[i]), 0);
  const gen = (seed: number, over: Record<string, number>) => generate(seed, { ...defaultParams(), ...over }, { k, features: { trees: false, clouds: false } });

  it('replace the stub bumps', () => {
    expect(enabledFeatures().map((f) => f.name)).toContain('mountains');
    expect(enabledFeatures().map((f) => f.name)).not.toContain('stubBumps');
  });

  it('mountainHeight raises the skyline', () => {
    let lo = 0;
    let hi = 0;
    for (let s = 1; s <= 3; s++) {
      lo += mean(heights(gen(s, { mountainHeight: 0.2 })));
      hi += mean(heights(gen(s, { mountainHeight: 0.9 })));
    }
    expect(hi).toBeGreaterThan(lo * 1.25);
  });

  it('ruggedness roughens the skyline', () => {
    let smooth = 0;
    let rough = 0;
    for (let s = 1; s <= 3; s++) {
      smooth += wiggle(heights(gen(s, { ruggedness: 1 })));
      rough += wiggle(heights(gen(s, { ruggedness: 8 })));
    }
    expect(rough).toBeGreaterThan(smooth);
  });

  it('every mountain in the registry owns rock cells', () => {
    const bp = gen(4, {});
    const owners = new Set<number>();
    for (let i = 0; i < bp.el.length; i++) if (bp.el[i] === El.ROCK) owners.add(bp.owner[i]);
    const mountains = [...bp.registry.strokes.values()].filter((s) => s.kind === 'mountain');
    expect(mountains.length).toBeGreaterThan(0);
    for (const m of mountains) expect(owners.has(m.id)).toBe(true);
  });

  it('mountainHeight 0 makes no mountains and does not throw', () => {
    const bp = gen(1, { mountainHeight: 0 });
    expect([...bp.registry.strokes.values()].filter((s) => s.kind === 'mountain')).toEqual([]);
  });
});
