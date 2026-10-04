import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { addStat, indexObjects, objectsOf, placers, type WorldObject } from '../src/core/objects';
import { setpieces } from '../src/core/setpieces';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';
import { hintsOf, makePlan, planOf } from '../src/gen/plan';
import { scan } from '../src/gen/scan';
import { artOf } from '../src/gen/artState';
import { markUnsupported } from '../src/sim/behaviors/rigid';
import { PERSON } from '../src/sim/elements/person';
import { RAIN } from '../src/sim/elements/rain';
import { moveCell, FREE } from '../src/sim/physics';
import { defaultParams } from '../src/core/params';
import { boxWorld, run } from './sim-helpers';

/** A WorldObject by hand, for sim-only tests. */
function track(world: World, id: number, kind: string, el = 0, tags: string[] = []): WorldObject {
  const o: WorldObject = { id, kind, tags, el, x: 0, y: 0, bbox: [0, 0, 0, 0], cells: 0, stats: {}, group: 0 };
  world.objects.set(id, o);
  return o;
}

describe('object tracking: cells keep their object id', () => {
  it('set() clears it unless given; swap and moveCell carry it', () => {
    const w = boxWorld();
    w.set(5, 5, El.ROCK, { obj: 7 });
    expect(w.obj[w.idx(5, 5)]).toBe(7);
    w.swap(5, 5, 6, 5);
    expect(w.obj[w.idx(6, 5)]).toBe(7);
    expect(w.obj[w.idx(5, 5)]).toBe(0);
    moveCell(w, 6, 5, 6, 8, FREE);
    expect(w.obj[w.idx(6, 8)]).toBe(7);
    expect(w.obj[w.idx(6, 5)]).toBe(0);
    w.set(6, 8, El.ASH);
    expect(w.obj[w.idx(6, 8)]).toBe(0);
  });

  it('a rigid piece that falls keeps its id on every cell', () => {
    const w = boxWorld();
    track(w, 3, 'boulder');
    for (let y = 5; y < 10; y++) for (let x = 10; x < 20; x++) w.set(x, y, El.ROCK, { obj: 3 });
    markUnsupported(w);
    run(w, 120);
    const idx = indexObjects(w);
    expect(idx.count(3)).toBe(50);
    expect(idx.bbox(3)).toEqual([10, 42, 19, 46]); // landed on the floor row (47)
  });

  it('a creature keeps its id while it walks, and loses it when it dies', () => {
    const w = boxWorld(120, 40);
    const o = track(w, 9, 'villager', PERSON);
    expect(placers.get(PERSON)!.place(w, 40, 36, { obj: 9, variant: 2, face: 1 })).toBe(true);
    run(w, 300);
    let idx = indexObjects(w);
    expect(idx.alive(o)).toBe(true);
    expect(idx.count(9, PERSON)).toBeGreaterThanOrEqual(31); // the whole sprite
    // cut a cell out of it: it bursts into ink and is gone
    const i = idx.firstCell(9);
    w.set(i % w.w, (i / w.w) | 0, El.EMPTY);
    run(w, 2);
    idx = indexObjects(w);
    expect(idx.alive(o)).toBe(false);
  });

  it('an invulnerable creature re-forms instead of dying', () => {
    const w = boxWorld(120, 40);
    const o = track(w, 9, 'villager', PERSON, ['invulnerable']);
    expect(placers.get(PERSON)!.place(w, 40, 36, { obj: 9, variant: 2, face: 1 })).toBe(true);
    for (let k = 0; k < 3; k++) {
      const i = indexObjects(w).firstCell(9);
      w.set(i % w.w, (i / w.w) | 0, El.EMPTY); // cut a piece out of it, anchor or not
      run(w, 3);
      expect(indexObjects(w).alive(o)).toBe(true);
    }
  });

  it('rain credits the object it lands on, through a puddle', () => {
    const w = boxWorld();
    const roof = track(w, 4, 'hut', 0, ['village']);
    for (let x = 0; x < w.w; x++) w.set(x, w.h - 1, El.ROCK, { obj: 4 });
    w.set(20, w.h - 2, El.WATER);
    w.set(20, 5, RAIN);
    w.set(30, 5, RAIN);
    run(w, 80);
    expect(roof.stats.rain).toBe(2);
    expect(scan(w).counts.villageRain).toBe(2);
    addStat(w, 0, 'rain'); // id 0 is never tracked
    addStat(w, 99, 'rain'); // nor are unknown ids
    expect(roof.stats.rain).toBe(2);
  });

  it('the world hash sees object ids and object stats', () => {
    const w = boxWorld();
    const o = track(w, 1, 'thing');
    const h0 = w.hash();
    w.obj[0] = 1;
    const h1 = w.hash();
    expect(h1).not.toBe(h0);
    o.stats.rain = 1;
    expect(w.hash()).not.toBe(h1);
  });
});

describe('setpieces', () => {
  const params = defaultParams();
  const opts = (s: { type: string; [k: string]: unknown }[]) => ({ k: 1, setpieces: s });

  it('an unknown setpiece fails loudly', () => {
    expect(() => generate(1, params, opts([{ type: 'nope' }]))).toThrow(/Unknown setpiece type "nope"/);
  });

  it('no setpieces leaves the painting exactly as before', () => {
    const a = generate(5, params, { k: 1 });
    const b = generate(5, params, opts([]));
    expect(b.el).toEqual(a.el);
    expect(planOf(b)).toEqual(planOf(a));
  });

  it('a forced mountain is planned where the level asks; a clearing stays free', () => {
    const bp = generate(5, params, opts([{ type: 'mountain', x: 0.5, height: 1 }, { type: 'clearing', x0: 0.1, x1: 0.3 }]));
    const u = artOf(bp).u;
    const hints = hintsOf(bp)!;
    expect(hints.mountains).toHaveLength(1);
    const plan = makePlan(5, params, u, hints).filter((p) => p.depth !== 'far');
    expect(plan.some((p) => Math.abs(p.x - 0.5 * u.widthUnits) < 1 && p.depth === 'near')).toBe(true);
    for (const p of plan) {
      if (Math.abs(p.x - 0.5 * u.widthUnits) < 1) continue;
      expect(p.x + p.halfWidth <= 0.1 * u.widthUnits || p.x - p.halfWidth >= 0.3 * u.widthUnits).toBe(true);
    }
  });

  it('every setpiece type the levels use is registered', () => {
    for (const t of ['mountain', 'clearing', 'moon', 'village', 'captives', 'spring', 'people']) expect(setpieces.has(t)).toBe(true);
  });

  it('a village is huts, its own trees, villagers and the ground under it; all revealed as objects', () => {
    const bp = generate(3, params, opts([{ type: 'village', x0: 0.6, x1: 0.9, huts: 3, trees: 2, people: 4 }]));
    const world = new World(bp, 3, params);
    new Frontier(bp).revealAll(world);
    expect(objectsOf(world, 'hut')).toHaveLength(3);
    expect(objectsOf(world, 'villager')).toHaveLength(4);
    expect(objectsOf(world, 'village')).toHaveLength(1);
    expect(objectsOf(world, 'tree', 'village')).toHaveLength(2);
    const s = scan(world);
    expect(s.counts.villagers).toBe(4);
    expect(s.counts.huts).toBe(3);
    // the huts are wood, not trees, and not peaks
    const hut = objectsOf(world, 'hut')[0];
    expect(hut.cells).toBeGreaterThan(50);
    expect(s.peaks.every((p) => p.x < 0.58 * world.w || p.x > 0.92 * world.w)).toBe(true);
  });

  it('a sealed spring fills its hollow but is not a pond until it is opened', () => {
    const bp = generate(44, params, opts([{ type: 'spring', rate: 1 }]));
    expect(bp.registry.waterSources).toHaveLength(1);
    const world = new World(bp, 44, params);
    new Frontier(bp).revealAll(world);
    run(world, 300);
    const s = scan(world);
    expect(s.counts.water).toBeGreaterThan(40);
    expect(s.counts.largestPond).toBe(0);
  });
});
