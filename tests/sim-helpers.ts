import '../src/pages/bootstrap';
import type { AbilityArgs, PointerSample } from '../src/core/abilities';
import { El } from '../src/core/elements';
import { ActionDriver } from '../src/core/replay';
import { World } from '../src/core/world';
import { step } from '../src/sim/step';

/** A small empty world with a ROCK floor on the bottom row. */
export function boxWorld(w = 64, h = 48, seed = 1): World {
  const world = new World({ w, h }, seed);
  for (let x = 0; x < w; x++) world.set(x, h - 1, El.ROCK);
  return world;
}

export function fillRect(world: World, x0: number, y0: number, x1: number, y1: number, el: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) world.set(x, y, el, { aux: 128 });
}

export function run(world: World, ticks: number): void {
  for (let t = 0; t < ticks; t++) step(world);
}

export function count(world: World, el: number): number {
  let n = 0;
  for (let i = 0; i < world.size; i++) if (world.el[i] === el) n++;
  return n;
}

/** Lowest row (largest y) that is not entirely free of `el`, and the highest one. */
export function rowsOf(world: World, el: number): { top: number; bottom: number } {
  let top = world.h;
  let bottom = -1;
  for (let i = 0; i < world.size; i++) {
    if (world.el[i] !== el) continue;
    const y = (i / world.w) | 0;
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { top, bottom };
}

/** Drag an ability along `pts` one point per tick, the way the sandbox feeds pointer input. */
export function stroke(world: World, ability: string, pts: [number, number, number?][], args: AbilityArgs = {}, holdTicks = 0): void {
  const driver = new ActionDriver();
  const s = (p: [number, number, number?]): PointerSample => ({ x: p[0], y: p[1], speed: p[2] ?? 4 });
  driver.begin(ability, s(pts[0]), args);
  driver.apply(world);
  step(world);
  for (const p of pts.slice(1)) {
    driver.move(s(p));
    driver.apply(world);
    step(world);
  }
  for (let t = 0; t < holdTicks; t++) {
    driver.apply(world);
    step(world);
  }
  driver.end();
  driver.apply(world);
}
