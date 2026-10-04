import type { World } from '../core/world';

/**
 * Is the cell at index i part of something the level protects (an object tagged 'invulnerable',
 * e.g. the caged birds of The Trap)? Blades, fire and the eraser pass over such cells; if something
 * else still takes a piece of it, the creature re-forms (sim/creatures.ts).
 */
export function isProtected(world: World, i: number): boolean {
  const id = world.obj[i];
  return id !== 0 && world.objects.get(id)?.tags.includes('invulnerable') === true;
}
