import { describe, expect, it } from 'vitest';
import { levels } from '../src/core/levels';
import { objectsOf } from '../src/core/objects';
import { defaultParams } from '../src/core/params';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';
import { scan } from '../src/gen/scan';
import './helpers';

/** The level page generates at the default art resolution (no k), not the k = 1 the playthroughs use. */
describe('the village', () => {
  it('The Drought gets all four villagers, spread apart, at the level page resolution', () => {
    const level = levels.get('level-3')!;
    const params = defaultParams();
    for (const [key, p] of Object.entries(level.params)) params[key] = p.value;
    const bp = generate(level.seed, params, { features: level.featuresEnabled, setpieces: level.setpieces });
    const world = new World(level.dims, level.seed, { ...params });
    const frontier = new Frontier(bp);
    frontier.revealAll(world);
    const xs = objectsOf(world, 'villager')
      .map((o) => o.x)
      .sort((a, b) => a - b);
    expect(scan(world).counts.villagers).toBe(4);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(7); // nobody stacked on a neighbour
  }, 60_000);
});
