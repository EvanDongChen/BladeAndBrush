import { TICK_HZ } from './constants';

/**
 * Fixed-timestep loop. The page feeds it wall-clock deltas; the sim only ever sees whole ticks.
 * The clock itself never reads the time, so it is deterministic and testable.
 */
export class Clock {
  static readonly STEP_MS = 1000 / TICK_HZ;
  paused = false;
  /** Sim speed multiplier (0.25x .. 4x on the test pages). */
  speed = 1;
  /** Cap per advance() call so a stalled tab does not spiral. Excess time is dropped. */
  maxTicksPerAdvance = 32;
  /** Ticks owed, in tick units. */
  private acc = 0;

  constructor(private readonly onTick: () => void) {}

  /** Feed elapsed wall time. Returns how many ticks ran. */
  advance(dtMs: number): number {
    if (this.paused) return 0;
    this.acc += (dtMs * this.speed) / Clock.STEP_MS;
    let n = 0;
    // epsilon so N * STEP_MS of input always yields exactly N ticks despite float rounding
    while (this.acc >= 1 - 1e-9 && n < this.maxTicksPerAdvance) {
      this.acc -= 1;
      this.onTick();
      n++;
    }
    if (n === this.maxTicksPerAdvance) this.acc = Math.min(this.acc, 1);
    if (this.acc < 0) this.acc = 0;
    return n;
  }

  /** Run exactly one tick (works while paused). */
  stepOnce(): void {
    this.onTick();
  }

  reset(): void {
    this.acc = 0;
  }
}
