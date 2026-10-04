/**
 * The four levels: each one generates its story (setpieces) whatever the seed, starts unsolved, and
 * can be solved within its ink budget with the real abilities. The playthroughs aim at the tracked
 * objects (core/objects.ts) instead of hard-coded spots, so they survive generator tweaks.
 */
import { describe, expect, it } from 'vitest';
import { evaluateGoal } from '../src/core/goals';
import { levels, type LevelDef } from '../src/core/levels';
import { indexObjects, objectsOf } from '../src/core/objects';
import { defaultParams } from '../src/core/params';
import { ActionDriver } from '../src/core/replay';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';
import { scan } from '../src/gen/scan';
import { step } from '../src/sim/step';
import './helpers';

function play(id: string, over: Record<string, number> = {}) {
  const level = levels.get(id)!;
  const params = defaultParams();
  for (const [k, p] of Object.entries(level.params)) params[k] = p.value;
  Object.assign(params, over);
  const bp = generate(level.seed, params, { setpieces: level.setpieces, k: 1 });
  const world = new World(level.dims, level.seed, params);
  const frontier = new Frontier(bp);
  while (!frontier.done) {
    frontier.advance(world);
    step(world);
  }
  let used = 0;
  /** One ability use: press at (x0, y0), aim at (x1, y1), hold `hold` ticks, release, then let `after` ticks pass. */
  const act = (ability: string, x0: number, y0: number, x1: number, y1: number, radius: number, hold = 0, after = 60) => {
    used++;
    const d = new ActionDriver();
    d.begin(ability, { x: x0, y: y0, speed: 0 }, { radius });
    d.apply(world);
    step(world);
    d.move({ x: x1, y: y1, speed: 6 });
    for (let t = 0; t <= hold; t++) {
      d.apply(world);
      step(world);
    }
    d.end();
    d.apply(world);
    for (let t = 0; t < after; t++) step(world);
  };
  const goals = () => level.goals.map((g) => evaluateGoal(scan(world), g).pass);
  return { level, world, act, goals, used: () => used };
}

/** Top non-empty row in column x. */
const topAt = (world: World, x: number) => {
  for (let y = 0; y < world.h; y++) if (world.el[y * world.w + x] !== 0) return y;
  return world.h;
};

describe('levels', () => {
  it('there are four, each with a title, a poem line per goal and a budget', () => {
    const all = levels.all();
    expect(all.map((l: LevelDef) => l.title)).toEqual(['The Peak', 'The Eclipse', 'The Drought', 'The Trap']);
    for (const l of all) {
      expect(l.poem).toHaveLength(l.goals.length);
      expect(l.actionBudget).toBeGreaterThan(0);
    }
  });

  it('1 The Peak: cut every other mountain down until one tall peak stands, trees spared', () => {
    const { world, act, goals, used, level } = play('level-1');
    expect(goals()).not.toEqual([true, true, true]);
    for (let round = 0; round < 3 && used() < level.actionBudget; round++) {
      const peaks = scan(world).peaks;
      const center = peaks.reduce((a, b) => (b.h > a.h ? b : a));
      for (const p of peaks) {
        if (p === center || used() >= level.actionBudget) continue;
        const y = world.h - p.h + 45;
        act('slash', p.x - 90, y, p.x + 90, y, 24, 45, 240);
      }
    }
    expect(goals()).toEqual([true, true, true]);
  }, 60_000);

  it('2 The Eclipse: break the moon, one tall peak each side of it, burn every tree', () => {
    const { world, act, goals, used, level } = play('level-2', { spacing: 0.7 }); // the player widens the spacing
    const moon = objectsOf(world, 'moon')[0];
    expect(moon.cells).toBeGreaterThan(500);
    act('slash', moon.x - 40, moon.y, moon.x + 40, moon.y, 3);
    expect(scan(world).counts.moonBroken).toBe(1);
    // fire, aimed each time at the line through the most trees still standing (from the leftmost)
    // where each tree's wood is now (a burnt trunk drops its canopy, which keeps the tree's id)
    const standing = () => {
      const idx = indexObjects(world);
      return objectsOf(world, 'tree')
        .filter((t) => idx.count(t.id, 2) * 4 >= t.cells && idx.count(t.id, 2) > 0)
        .map((t) => {
          const [bx0, by0, bx1, by1] = idx.bbox(t.id)!;
          return { x: (bx0 + bx1) >> 1, y: (by0 + by1) >> 1 };
        });
    };
    const near = (t: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const k = Math.max(0, Math.min(1, ((t.x - a.x) * dx + (t.y - a.y) * dy) / Math.max(1, dx * dx + dy * dy)));
      return Math.hypot(t.x - a.x - k * dx, t.y - a.y - k * dy) < 28;
    };
    const burning = () => world.el.some((e) => e === 4);
    while (used() < level.actionBudget) {
      for (let t = 0; t < 900 && burning(); t += 30) for (let k = 0; k < 30; k++) step(world); // let the fire die down first
      const trees = standing().sort((p, q) => p.x - q.x);
      if (trees.length === 0) break;
      const a = trees[0];
      let best = a;
      let hits = 0;
      for (const b of trees) {
        if (b.x - a.x > 220) break;
        const n = trees.filter((t) => near(t, a, b)).length;
        if (n > hits) (hits = n), (best = b);
      }
      act('fire', a.x - 4, a.y, best.x + 4, best.y, 18, 45, 200);
    }
    for (let t = 0; t < 900; t++) step(world);
    expect(goals()).toEqual([true, true, true]);
  }, 60_000);

  it('3 The Drought: a waterfall down a slashed shaft, rain from fire over water, nobody lost', () => {
    const { world, act, goals, used, level } = play('level-3');
    expect(scan(world).counts.villagers).toBe(5);
    // a shaft down the mountain nearest the village, filled with water
    const peaks = scan(world).peaks.filter((p) => p.x < 0.6 * world.w);
    const p = peaks[peaks.length - 1];
    act('slash', p.x, world.h - p.h - 5, p.x, world.h - p.h + 55, 2, 0, 120);
    act('water', p.x - 14, world.h - p.h - 20, p.x + 14, world.h - p.h - 20, 5, 30, 300);
    // flood the village, then run fire over the water: steam rises and comes down as rain
    const village = objectsOf(world, 'village')[0];
    const [x0, , x1] = village.bbox;
    act('water', x0 + 70, 190, x1 - 70, 190, 8, 45, 240);
    let surface = world.h;
    for (let x = x0 + 80; x < x1 - 80; x++) for (let y = 150; y < world.h; y++) if (world.el[y * world.w + x] === 3) {
      surface = Math.min(surface, y);
      break;
    }
    while (used() < level.actionBudget && scan(world).counts.villageRain < 5) act('fire', x0 + 80, surface - 2, x1 - 80, surface - 2, 3, 45, 900);
    expect(goals()).toEqual([true, true, true]);
  }, 60_000);

  it('4 The Trap: open each hollow beside its bird, tap the spring, cut down the trappers', () => {
    const { world, act, goals } = play('level-4');
    const birds = objectsOf(world, 'bird');
    expect(birds).toHaveLength(3);
    expect(scan(world).counts.animalsTrapped).toBe(3);
    for (const b of birds) {
      const at = indexObjects(world).firstCell(b.id) % world.w;
      const x = at < b.x ? b.bbox[2] - 2 : b.bbox[0] + 2; // the side the bird is not on
      act('slash', x, topAt(world, x) - 10, x, b.y - 1, 1.5);
    }
    const spring = objectsOf(world, 'spring')[0];
    act('slash', spring.bbox[2] - 2, spring.y + 4, spring.bbox[2] + 60, spring.y + 30, 3, 0, 800);
    for (let k = 0; k < 3; k++) {
      const idx = indexObjects(world);
      const t = objectsOf(world, 'trapper').find((o) => idx.alive(o));
      if (!t) break;
      const i = idx.firstCell(t.id);
      const x = i % world.w;
      const y = ((i / world.w) | 0) + 3;
      act('slash', x - 12, y, x + 12, y, 4);
    }
    for (let t = 0; t < 600; t++) step(world);
    expect(goals()).toEqual([true, true, true]);
  }, 60_000);
});
