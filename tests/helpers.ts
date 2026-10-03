import '../src/pages/bootstrap';
import { DEFAULT_DIMS, type LevelDims } from '../src/core/constants';
import { defaultParams, type GenParams } from '../src/core/params';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';

/** A world with the stub blueprint fully revealed, like the sandbox's default scene. */
export function blueprintWorld(seed: number, params: GenParams = defaultParams(), dims: LevelDims = DEFAULT_DIMS): World {
  const world = new World(dims, seed, params);
  new Frontier(generate(seed, params, { dims })).revealAll(world);
  return world;
}
