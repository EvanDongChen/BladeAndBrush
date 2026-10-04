import { describe, expect, it } from 'vitest';
import './helpers';
import { activeAbilities } from '../src/core/abilities';
import { defaultParams } from '../src/core/params';
import { ActionDriver } from '../src/core/replay';
import { World } from '../src/core/world';
import { LESSONS, TUTORIAL_DIMS, TUTORIAL_SEED, type Lesson } from '../src/pages/tutorialLessons';
import { step } from '../src/sim/step';

function scene(lesson: Lesson): World {
  const world = new World(TUTORIAL_DIMS, TUTORIAL_SEED, defaultParams());
  lesson.build(world);
  return world;
}

/** Play the lesson's solution through the action driver, like the page does, then let it settle. */
function solve(lesson: Lesson, world: World, settle = 900): void {
  const driver = new ActionDriver();
  const tick = () => {
    driver.apply(world);
    step(world);
  };
  for (const s of lesson.solution) {
    driver.begin(lesson.ability, { x: s.from[0], y: s.from[1], speed: 0 }, { radius: lesson.radius });
    tick();
    for (let k = 0; k < s.hold; k++) tick();
    driver.move({ x: s.to[0], y: s.to[1], speed: 4 });
    driver.end();
    for (let k = 0; k < 60; k++) tick();
  }
  for (let k = 0; k < settle; k++) tick();
}

describe('tutorial', () => {
  it('teaches every ability the player has, once each', () => {
    const taught = LESSONS.map((l) => l.ability).sort();
    expect(taught).toEqual(activeAbilities(false).map((a) => a.id).sort());
  });

  for (const lesson of LESSONS) {
    describe(lesson.ability, () => {
      it('starts unsolved and stays that way when left alone', () => {
        const world = scene(lesson);
        expect(lesson.progress(world)).toBeLessThan(0.05);
        for (let k = 0; k < 240; k++) step(world);
        expect(lesson.progress(world)).toBeLessThan(0.05);
      });

      it('is solved by its own "Show me" strokes', () => {
        const world = scene(lesson);
        solve(lesson, world);
        expect(lesson.progress(world)).toBe(1);
      }, 60000);
    });
  }
});
