import { rgba } from '../elements';
import { registerLayer } from '../render';

let cache: Uint32Array | null = null;

/** Plain paper color (no grain: the ink carries all the texture). */
function paper(size: number): Uint32Array {
  if (cache && cache.length === size) return cache;
  cache = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    cache[i] = rgba(238, 230, 212);
  }
  return cache;
}

registerLayer({
  name: 'paper',
  order: 0,
  kind: 'pixels',
  draw: ({ pixels, world }) => pixels.set(paper(world.size)),
});
