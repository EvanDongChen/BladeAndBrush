/**
 * Extra events emitted by the sim, added to core's GameEvents by declaration merging (no core
 * change needed). Pages use them for feedback (trail, shake, hit-stop, sound). Like all events,
 * listeners must never change the World.
 */
declare module '../core/events' {
  interface GameEvents {
    /** A line ability was released. power is 1 uncharged, up to 1 + charge bonus when fully charged. */
    lineFire: { id: string; x0: number; y0: number; x1: number; y1: number; r: number; power: number };
    /** A rigid piece hit something hard, or rock shattered. strength is roughly cells x speed. */
    impact: { x: number; y: number; strength: number };
  }
}

export {};
