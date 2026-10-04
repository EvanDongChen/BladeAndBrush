import { over } from '../../core/artCompose';

/** One art plane plus a per-pixel owner mask (which stroke covers each pixel; gen-only, not stored). */
export class ArtBuffer {
  readonly own: Uint16Array;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly px: Uint32Array,
  ) {
    this.own = new Uint16Array(w * h);
  }

  /** Composite `color` over pixel i; claim it for `owner` if given. */
  blend(i: number, color: number, owner?: number): void {
    this.px[i] = over(color, this.px[i]);
    if (owner !== undefined) this.own[i] = owner;
  }
}
