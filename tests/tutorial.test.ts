import { describe, expect, it } from 'vitest';
import './helpers';
import { activeAbilities } from '../src/core/abilities';
import { defaultParams } from '../src/core/params';
import { ActionDriver } from '../src/core/replay';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';
import { scan } from '../src/gen/scan';
import { LESSONS, TUTORIAL_DIMS, TUTORIAL_SEED, type GraphLesson, type NatureLesson, type StrokeLesson } from '../src/pages/tutorialLessons';
import { step } from '../src/sim/step';

function scene(lesson: StrokeLesson | NatureLesson): World {
  const world = new World(TUTORIAL_DIMS, TUTORIAL_SEED, defaultParams());
  lesson.build(world);
  return world;
}

/**
 * Play the lesson's strokes through the action driver, like the page does, then let it settle.
 * Returns the best progress seen: the page marks a lesson done the moment it gets there.
 */
function strike(lesson: StrokeLesson, world: World, settle = 900): number {
  const driver = new ActionDriver();
  let best = 0;
  const tick = () => {
    driver.apply(world);
    step(world);
    if (world.tick % 10 === 0) best = Math.max(best, lesson.progress(world));
  };
  for (const s of lesson.solution) {
    for (let k = 0; k < (s.wait ?? 0); k++) tick();
    driver.begin(s.ability ?? lesson.ability, { x: s.from[0], y: s.from[1], speed: 0 }, { radius: lesson.radius });
    tick();
    for (let k = 0; k < s.hold; k++) tick();
    driver.move({ x: s.to[0], y: s.to[1], speed: 4 });
    driver.end();
    for (let k = 0; k < 60; k++) tick();
  }
  for (let k = 0; k < settle; k++) tick();
  return Math.max(best, lesson.progress(world));
}

/** Does the lesson's progress reach 1 within `ticks` (the page latches it the moment it does)? */
function reaches(lesson: StrokeLesson | NatureLesson, world: World, ticks: number): boolean {
  for (let k = 0; k < ticks; k++) {
    step(world);
    if (k % 10 === 0 && lesson.progress(world) >= 1) return true;
  }
  return lesson.progress(world) >= 1;
}

function painted(lesson: GraphLesson, mountainHeight: number) {
  const params = { ...defaultParams(), ...lesson.params, mountainHeight };
  const world = new World(lesson.dims, lesson.seed, params);
  new Frontier(generate(lesson.seed, params, { dims: lesson.dims, k: 1 })).revealAll(world);
  return scan(world);
}

describe('tutorial', () => {
  it('teaches every ability the player has, each in a lesson of its own', () => {
    const own = LESSONS.flatMap((l) => (l.kind === 'stroke' && !l.also ? [l.ability] : [])).sort();
    expect(own).toEqual(activeAbilities(false).map((a) => a.id).sort());
  });

  it('teaches both knobs of the Nature panel and the mountain graph', () => {
    expect(LESSONS.flatMap((l) => (l.kind === 'nature' ? [l.control] : [])).sort()).toEqual(['gravity', 'wind']);
    expect(LESSONS.some((l) => l.kind === 'graph')).toBe(true);
  });

  for (const lesson of LESSONS) {
    describe(lesson.name, () => {
      if (lesson.kind === 'graph') {
        it('starts with no tall peaks, and the red line set to its solution paints them', () => {
          expect(lesson.progress(painted(lesson, lesson.params.mountainHeight ?? 0.5))).toBeLessThan(0.5);
          expect(lesson.progress(painted(lesson, lesson.solution.mountainHeight))).toBe(1);
        }, 120000);
        return;
      }

      it('starts unsolved and stays that way when left alone', () => {
        const world = scene(lesson);
        expect(lesson.progress(world)).toBeLessThan(0.05);
        for (let k = 0; k < 600; k++) step(world);
        expect(lesson.progress(world)).toBeLessThan(0.05);
      });

      it('is solved by its own "Show me"', () => {
        const world = scene(lesson);
        if (lesson.kind === 'stroke') {
          expect(strike(lesson, world)).toBe(1);
        } else {
          Object.assign(world.params, lesson.solution);
          expect(reaches(lesson, world, 1800)).toBe(true);
        }
        if (lesson.kind === 'stroke' && lesson.also) {
          // and not by its first stroke alone (rain needs the fire as well as the water)
          const half = scene(lesson);
          expect(strike({ ...lesson, solution: lesson.solution.slice(0, 1) }, half)).toBeLessThan(0.5);
        }
      }, 60000);
    });
  }

  it('wind only clears the bank in a gale, and gravity must be turned over', () => {
    const wind = LESSONS.find((l): l is NatureLesson => l.kind === 'nature' && l.control === 'wind')!;
    const breeze = scene(wind);
    breeze.params.wind = 0.3;
    expect(reaches(wind, breeze, 900)).toBe(false);
    const gravity = LESSONS.find((l): l is NatureLesson => l.kind === 'nature' && l.control === 'gravity')!;
    const heavy = scene(gravity);
    heavy.params.gravity = 6;
    expect(reaches(gravity, heavy, 900)).toBe(false);
  }, 60000);
});
