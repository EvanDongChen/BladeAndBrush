/** Grid size for one level. Passed into World and generate(); never a global. */
export interface LevelDims {
  w: number;
  h: number;
}

/** Wide, short scroll (~3.75:1, like the reference painting). Default only; levels may override. */
export const DEFAULT_DIMS: LevelDims = { w: 960, h: 256 };

/** Fixed simulation rate. The sim never reads wall-clock time; it only counts ticks. */
export const TICK_HZ = 60;

/** Bits in World.flags. */
export const Flag = {
  /** Cell already moved/updated this tick. Cleared at the start of every step. */
  UPDATED: 1,
  /** Cell was cleared by a slash. The frontier reveal skips CUT cells. Stays with the position. */
  CUT: 2,
  /** Cell was written by the frontier reveal from the blueprint. */
  GENERATED: 4,
  /**
   * Where generated land stands on its (unpainted) ground: the bottom cell of a mountain or plateau.
   * Rigid material here counts as resting on the ground. Stays with the position, like CUT.
   */
  FOOT: 8,
  /** The position has more material stacked behind its front cell (see World.behindEl). */
  HAS_BEHIND: 16,
  /** The position is already in World's pending-promotion list this tick. */
  QUEUED: 32,
} as const;

/** Materials that can be stacked behind a position's front cell (front + this many = a full stack). */
export const BEHIND_LAYERS = 4;

/** World.plane value for cells that came from no blueprint plane (painted, spawned, dynamic). */
export const NO_PLANE = 255;

/** World.plane value for cells that came from the far (background) plane; see flags.farLayerInteractive. */
export const FAR_PLANE = 4;
