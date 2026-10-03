/**
 * Hooks for the sandbox paint brush, so an element can control what painting it does. Register
 * from the element's own file in sim/elements/ (or sim/behaviors/); the brush looks them up.
 * Everything here runs inside the sim, so it may only use world.rng for randomness.
 */
import type { World } from '../core/world';

/** The aux value for one painted cell (e.g. banded bamboo joints, instead of random shade). */
export type PaintAux = (world: World, x: number, y: number) => number;

export const PAINT_AUX: (PaintAux | undefined)[] = new Array(256).fill(undefined);

export function registerPaintAux(el: number, fn: PaintAux): void {
  if (PAINT_AUX[el]) throw new Error(`Duplicate paint aux for element ${el}`);
  PAINT_AUX[el] = fn;
}

export interface Spawner {
  /** Place one thing at (x, y) (the brush calls this instead of filling a circle). */
  spawn(world: World, x: number, y: number): void;
  /** Dragging spawns another one every `spacing` cells, so a stroke makes a crowd, not a clump. */
  spacing: number;
}

export const SPAWNERS: (Spawner | undefined)[] = new Array(256).fill(undefined);

export function registerSpawner(el: number, spawn: Spawner['spawn'], spacing = 12): void {
  if (SPAWNERS[el]) throw new Error(`Duplicate spawner for element ${el}`);
  SPAWNERS[el] = { spawn, spacing };
}
