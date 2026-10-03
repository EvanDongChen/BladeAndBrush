import { species, type Species } from './registry';

// Every species file in this folder registers itself.
import.meta.glob(['./*.ts', '!./index.ts'], { eager: true });

export { registerSpecies, species, type GrowCtx, type Species } from './registry';

export function getSpecies(name: string): Species {
  const s = species.get(name);
  if (!s) throw new Error(`Unknown species "${name}"`);
  return s;
}
