/**
 * Seeded RNG (mulberry32). ALL randomness in core/, gen/ and sim/ goes through one of these.
 * The state is a single int32, so it can be hashed and snapshotted.
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Float in [a, b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Mix numbers and strings into a 32-bit seed. Used to derive independent sub-seeds. */
export function hashSeed(...parts: (number | string)[]): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  for (const p of parts) {
    if (typeof p === 'number') {
      const v = p | 0;
      mix(v);
      mix(v >>> 8);
      mix(v >>> 16);
      mix(v >>> 24);
    } else {
      for (let i = 0; i < p.length; i++) mix(p.charCodeAt(i));
    }
    mix(0x5f); // separator so ("ab", "c") != ("a", "bc")
  }
  // final avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}
