import { describe, expect, it } from 'vitest';
import { Flag } from '../src/core/constants';
import { El } from '../src/core/elements';
import { boxWorld, count, fillRect, run } from './sim-helpers';

describe('trees growing on a mountain face (Flag.ON_ROCK)', () => {
  it('burn, but turn back into rock instead of leaving a hole', () => {
    const world = boxWorld(64, 48);
    fillRect(world, 10, 20, 40, 46, El.ROCK); // the mountain
    fillRect(world, 18, 24, 26, 30, El.TREE); // a tree painted over its face
    for (let y = 24; y <= 30; y++) for (let x = 18; x <= 26; x++) world.flags[world.idx(x, y)] |= Flag.ON_ROCK;
    fillRect(world, 44, 40, 50, 46, El.TREE); // an ordinary tree on open ground
    const rockBefore = count(world, El.ROCK);

    world.set(22, 27, El.FIRE);
    world.set(47, 43, El.FIRE);
    run(world, 900);

    expect(count(world, El.TREE)).toBe(0); // both burnt
    expect(count(world, El.ROCK)).toBe(rockBefore + 9 * 7); // the face is whole again
    for (let y = 40; y <= 46; y++) for (let x = 44; x <= 50; x++) expect(world.get(x, y)).not.toBe(El.ROCK); // open-ground tree left no rock
  });
});
