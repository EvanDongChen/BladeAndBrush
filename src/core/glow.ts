import { elementName } from './elements';
import { ExtensionRegistry } from './registry';

/**
 * Glowing pixels. An element that registers a glow lights up the space around its cells: the
 * glow layer (core/layers/glow.ts) blurs every glowing cell into a soft halo and draws it over
 * the painting, so fire, embers or lanterns look like they give off light. Drop a registerGlow()
 * call into any file in sim/elements/ (or gen/elements/).
 *
 * A glow has two bands: a tight, bright one close to the cell (`near`, added on top like a bloom)
 * and a wide, faint one (`far`, a warm tint that spills over rock and paper).
 */
export interface GlowSpec {
  el: number;
  /** Halo color. */
  r: number;
  g: number;
  b: number;
  /** Strength of the tight halo, roughly 0 to 1 (a solid blob of cells reads as about this). */
  near: number;
  /** Strength of the wide, faint halo. */
  far: number;
  /** Optional per-cell brightness 0..1 from its life and aux (e.g. a flame dims as it dies). */
  level?: (life: number, aux: number) => number;
}

export const glows = new ExtensionRegistry<GlowSpec>('glow', (g) => g.el, (g) => elementName(g.el));

/** Hot-loop lookup by element id. */
export const GLOW: (GlowSpec | undefined)[] = new Array(256).fill(undefined);

/** Throws if the element already has a glow. */
export function registerGlow(spec: GlowSpec): GlowSpec {
  glows.register(spec);
  GLOW[spec.el] = spec;
  return spec;
}
