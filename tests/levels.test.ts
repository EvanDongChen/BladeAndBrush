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
import { scan, skyReach } from '../src/gen/scan';
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
export const topAt = (world: World, x: number) => {
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
    const { world, act, goals } = play('level-1');
    expect(goals()).not.toEqual([true, true, true]);
    for (let round = 0; round < 6; round++) {
      const { peaks, heights } = scan(world);
      const center = peaks.reduce((a, b) => (b.h > a.h ? b : a));
      for (const p of peaks) {
        if (p === center) continue;
        const y = world.h - heights[p.x] + Math.round(p.h * 0.6); // into the mountain, well below its top
        act('slash', p.x - 90, y, p.x + 90, y, 24, 45, 240);
      }
    }
    expect(goals()).toEqual([true, true, true]);
  }, 120_000);

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

  it('3 The Drought: a waterfall down a slashed shaft, steam from fire over water soaks the cloud and it rains, nobody lost', () => {
    const { world, act, goals } = play('level-3');
    expect(scan(world).counts.villagers).toBe(5);
    expect(objectsOf(world, 'cloud').length).toBeGreaterThan(0);
    // a shaft down the mountain nearest the village, filled with water
    const { peaks, heights } = scan(world);
    const p = peaks.filter((q) => q.x < 0.6 * world.w).pop()!;
    const top = world.h - heights[p.x];
    act('slash', p.x, top - 5, p.x, top + 55, 2, 0, 120);
    act('water', p.x - 14, top - 20, p.x + 14, top - 20, 5, 30, 300);
    // flood the village, then run fire over the water: the steam rises into the cloud, which rains
    const village = objectsOf(world, 'village')[0];
    const [x0, , x1] = village.bbox;
    const ground = village.y;
    act('water', x0 + 20, ground - 30, x1 - 20, ground - 30, 8, 45, 240);
    const tops: number[] = [];
    for (let x = x0; x <= x1; x++) for (let y = 100; y < world.h; y++) if (world.el[y * world.w + x] === 3) {
      tops.push(y);
      break;
    }
    tops.sort((a, b) => a - b);
    const surface = tops[tops.length >> 1];
    act('fire', x0 + 30, surface - 2, x1 - 30, surface - 2, 3, 45, 1500);
    expect(goals()).toEqual([true, true, true]);
  }, 120_000);

  it('4 The Trap: open each hollow beside its bird, tap the spring, cut down the trappers', () => {
    const { world, act, goals } = play('level-4');
    const birds = objectsOf(world, null, 'captive');
    expect(birds).toHaveLength(3);
    expect(scan(world).counts.animalsTrapped).toBe(3);
    /** First open-air cell going from (x, y) along (dx, dy): where a cut from outside should start. */
    const outside = (x: number, y: number, dx: number, dy: number) => {
      const sky = skyReach(world);
      for (let k = 1; k < 300; k++) {
        const px = Math.round(x + dx * k);
        const py = Math.round(y + dy * k);
        if (px < 0 || py < 0 || px >= world.w || py >= world.h) break;
        if (sky[py * world.w + px]) return { x: x + dx * (k + 6), y: y + dy * (k + 6) };
      }
      return { x: x + dx * 120, y: y + dy * 120 };
    };
    // open each hollow at its lower corner, from the open air, while the bird is up the other end
    for (const b of birds) {
      const side = indexObjects(world).firstCell(b.id) % world.w < b.x ? 1 : -1;
      for (let t = 0; t < 400; t++) {
        const box = indexObjects(world).bbox(b.id);
        if (box && (side > 0 ? box[2] < b.x : box[0] > b.x) && box[3] < b.y + 1) break;
        step(world);
      }
      const end = { x: b.x + side * 4, y: b.y + 2 };
      const from = outside(end.x, end.y, side * 0.7, -0.7);
      act('slash', from.x, from.y, end.x, end.y, 1.5);
    }
    const spring = objectsOf(world, 'spring')[0];
    const tap = { x: spring.x, y: spring.bbox[3] - 1 };
    // tap it on the side away from the nearest bird, so its water does not flood a bird's way out
    const nearest = birds.reduce((a, b) => (Math.abs(b.x - spring.x) < Math.abs(a.x - spring.x) ? b : a));
    const from = outside(tap.x, tap.y, nearest.x > spring.x ? -0.8 : 0.8, 0.6);
    act('slash', from.x, from.y, tap.x, tap.y, 3, 0, 900);
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
  }, 120_000);
});
