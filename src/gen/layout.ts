/**
 * Depth on the page (fractions of the scroll height, y down). Like a hand scroll seen from a
 * raised viewpoint, every object has a FOOT position y: the farther away, the higher on the page.
 * Objects are drawn back to front by y, and each one's white fill hides what is behind it.
 */
export const DEPTH = {
  /** Feet of the distant ridges (background plane). */
  farTop: 0.29,
  farBottom: 0.35,
  /** Feet of the mountains: from far back to the front of the scene. */
  mountTop: 0.375,
  mountBottom: 0.975,
  /** Feet of the flat plateaus (the foreground land). */
  flatTop: 0.69,
  flatBottom: 0.875,
  /** Mountains whose foot is below this go in the near plane, above it in the mid plane. */
  split: 0.66,
  /** The foreground: boulders and big trees stand here. */
  foreTop: 0.86,
  /** A thin floor along the bottom (physics needs somewhere for things to land). */
  floor: 0.985,
} as const;

/** Painting units a mountain's occluder dips below its foot at the middle (where the scanner measures from). */
export const FOOT_SKIRT = 22;
