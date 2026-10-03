import '../src/pages/bootstrap';
import { DEFAULT_DIMS, type LevelDims } from '../src/core/constants';
import { defaultParams, type GenParams } from '../src/core/params';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';

/**
 * A world with the blueprint fully revealed, like the sandbox's default scene. Generated at art
 * scale k = 1: physics/replay tests only read cells, so they skip the cost of high-res art.
 */
export function blueprintWorld(seed: number, params: GenParams = defaultParams(), dims: LevelDims = DEFAULT_DIMS): World {
  const world = new World(dims, seed, params);
  new Frontier(generate(seed, params, { dims, k: 1 })).revealAll(world);
  return world;
}
