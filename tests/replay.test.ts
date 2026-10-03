import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { ActionDriver, type ActionLog } from '../src/core/replay';
import type { World } from '../src/core/world';
import { step } from '../src/sim/step';
import { blueprintWorld } from './helpers';

const tick = (world: World, driver: ActionDriver) => {
  driver.apply(world);
  step(world);
};

describe('action log replay', () => {
  it('same seed + params + log gives the same final hash', () => {
    const live = blueprintWorld(11);
    const driver = new ActionDriver();
    // pointer input arrives between ticks, as on the sandbox page
    for (let t = 0; t < 120; t++) {
      if (t === 5) driver.begin('paint', { x: 100, y: 50, speed: 0 }, { el: El.WATER, radius: 4 });
      if (t > 5 && t < 40) driver.move({ x: 100 + (t - 5) * 3.3, y: 50 + (t % 7), speed: 3.3 });
      if (t === 40) driver.end();
      if (t === 60) driver.begin('paint', { x: 600, y: 120, speed: 0 }, { el: El.EMPTY, radius: 8 });
      if (t === 61) driver.move({ x: 640, y: 140, speed: 12.5 });
      if (t === 61) driver.end();
      tick(live, driver);
    }
    expect(driver.uses).toBe(2);
    const log = JSON.parse(JSON.stringify(driver.log)) as ActionLog; // survives serialization
    const untouched = blueprintWorld(11);
    for (let t = 0; t < 120; t++) step(untouched);
    expect(live.hash()).not.toBe(untouched.hash());

    const replayed = blueprintWorld(11);
    const player = new ActionDriver(log);
    player.begin('paint', { x: 1, y: 1, speed: 0 }, { el: El.ROCK }); // live input ignored while replaying
    while (replayed.tick < live.tick) tick(replayed, player);
    expect(replayed.hash()).toBe(live.hash());
    expect(player.log).toEqual(log);
  });

  it('unknown abilities are ignored, not recorded', () => {
    const world = blueprintWorld(1);
    const driver = new ActionDriver();
    driver.begin('doesNotExist', { x: 1, y: 1, speed: 0 });
    tick(world, driver);
    expect(driver.uses).toBe(0);
  });
});
