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
} as const;
