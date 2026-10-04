import type { Noise } from '../../core/noise';
import { ExtensionRegistry } from '../../core/registry';
import type { Rng } from '../../core/rng';
import type { PixelPainter } from '../paint/painter';

/** Everything a species needs to paint one tree. Coordinates are art pixels; y grows down. */
export interface GrowCtx {
  paint: PixelPainter;
  /** Foot of the trunk. */
  x: number;
  y: number;
  /** Overall height in art pixels. */
  size: number;
  /** Stroke id that owns the tree's pixels (and later its TREE cells). */
  owner: number;
  rng: Rng;
  noise: Noise;
  ink: [number, number, number];
  /** Art pixels per cell (for minimum stroke widths). */
  k: number;
}

/** One kind of tree. grow() paints it and returns the art bbox of the pixels it owns. */
export interface Species {
  name: string;
  grow(g: GrowCtx): [number, number, number, number];
}

export const species = new ExtensionRegistry<Species>('species', (s) => s.name);

export function registerSpecies(s: Species): Species {
  return species.register(s);
}
