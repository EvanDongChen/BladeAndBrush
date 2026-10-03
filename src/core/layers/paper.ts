import { rgba } from '../elements';
import { registerLayer } from '../render';

let cache: Uint32Array | null = null;

/** Paper color with a fixed, position-hashed grain (no RNG needed). */
function paper(size: number, w: number): Uint32Array {
  if (cache && cache.length === size) return cache;
  cache = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    const x = i % w;
    const y = (i / w) | 0;
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    const grain = ((n >>> 24) & 15) - 8;
    cache[i] = rgba(238 + grain, 230 + grain, 212 + grain);
  }
  return cache;
}

registerLayer({
  name: 'paper',
  order: 0,
  kind: 'pixels',
  draw: ({ pixels, world }) => pixels.set(paper(world.size, world.w)),
});
