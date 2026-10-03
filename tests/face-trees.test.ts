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

import { compose, prepareArt } from '../src/core/artCompose';
import { createBlueprint, hashBlueprint } from '../src/core/blueprint';
import { rgba } from '../src/core/elements';
import { defaultParams } from '../src/core/params';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';

describe('face trees in the blueprint', () => {
  it('the frontier marks onRock cells ON_ROCK in the world', () => {
    const bp = createBlueprint(1, defaultParams(), { w: 4, h: 1 });
    bp.el.set([El.TREE, El.TREE, El.ROCK, El.EMPTY]);
    bp.onRock = Uint8Array.from([1, 0, 0, 0]);
    const world = new World(bp, 1);
    new Frontier(bp).revealAll(world);
    expect(world.flags[0] & Flag.ON_ROCK).toBe(Flag.ON_ROCK);
    expect(world.flags[1] & Flag.ON_ROCK).toBe(0);
  });

  it('onRock and the under-art are part of the blueprint hash', () => {
    const bp = createBlueprint(1, defaultParams(), { w: 2, h: 1 });
    bp.onRock = new Uint8Array(2);
    const a = hashBlueprint(bp);
    bp.onRock[1] = 1;
    expect(hashBlueprint(bp)).not.toBe(a);
  });

  it('a burnt face tree (now rock) shows the rock art from under the tree', () => {
    const k = 1;
    const tree = rgba(10, 60, 10);
    const rock = rgba(90, 90, 90);
    const art = { k, fg: Uint32Array.from([tree]), bg: new Uint32Array(1), under: Uint32Array.from([rock]) };
    const out = new Uint32Array(1);
    compose(out, Uint8Array.from([El.ROCK]), Uint8Array.from([El.TREE]), 1, 1, prepareArt(art), 1);
    expect(out[0]).toBe(rock);
    compose(out, Uint8Array.from([El.TREE]), Uint8Array.from([El.TREE]), 1, 1, prepareArt(art), 1);
    expect(out[0]).toBe(tree);
  });
});
