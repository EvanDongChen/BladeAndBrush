/**
 * Kill switches. Anything flaky gets switched off here with one line instead of a revert.
 * Registered things (abilities, layers, ...) may name a `flag`; when that flag is false they
 * are skipped as if the file did not exist.
 */
export const flags: Record<string, boolean> = {
  audio: true,
  artLayer: true,
  splatter: true,
  fireSpread: true,
  glow: true,
  /** Sim cells that are not showing generator art are drawn by shaders (core/shaders/) at art resolution. Off = flat cell colors. */
  shaders: true,
  /**
   * Layered pixels: false = the far ridges are background art only (not interactive, never scanned).
   * true = the reveal puts them in the world as real ROCK at the back of each stack, so they can be
   * cut, burnt through and scanned. Read when the painting is revealed.
   */
  farLayerInteractive: false,
};

/** Generator feature toggles by feature name. Missing = enabled; false = removed from the pipeline. */
export const featureToggles: Record<string, boolean> = {};

export function flagOn(name: string | undefined): boolean {
  return name === undefined || flags[name] !== false;
}

/** `overrides` (e.g. a level's featuresEnabled or a page's toggles) win over featureToggles. */
export function featureOn(name: string, overrides?: Record<string, boolean>): boolean {
  return (overrides?.[name] ?? featureToggles[name]) !== false;
}
