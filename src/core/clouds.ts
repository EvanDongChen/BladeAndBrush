/**
 * Clouds are particles, not cells: each has a smooth position and size, drifts with the wind
 * across the scroll (and over the mountains, behind nothing and blocking nothing), and holds some
 * water. The sim moves them, soaks them with steam and rains from them (sim/behaviors/cloud.ts);
 * core/layers/clouds.ts draws them as soft puffs. They live on World.clouds and are part of its hash.
 */
export interface Cloud {
  /** Tracked object id (core/objects.ts), 0 for a puff made from steam. */
  obj: number;
  /** Centre, in cells (fractional). */
  x: number;
  y: number;
  /** Half width and half height, in cells. */
  hw: number;
  hh: number;
  /** Water it holds: 0 = dry and white; it rains while it has some. */
  water: number;
  /** A small cloud made of cooled steam: gone once it has rained itself out. */
  puff: boolean;
  /** Shape seed (lobe sizes). */
  seed: number;
}

/** Most water a cloud can hold: bigger clouds hold more. */
export function cloudCapacity(c: Cloud): number {
  return 60 * c.hw;
}

/** Is (x, y) inside the cloud (its rounded body, with the scroll wrapping around at width w)? */
export function inCloud(c: Cloud, x: number, y: number, w: number): boolean {
  let dx = x - c.x;
  if (dx > w / 2) dx -= w;
  else if (dx < -w / 2) dx += w;
  const ex = dx / c.hw;
  const ey = (y - c.y) / (c.hh * (y < c.y ? 1.6 : 0.8)); // taller above (the lobes), flat underneath
  return ex * ex + ey * ey <= 1;
}
