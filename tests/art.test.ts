import { describe, expect, it } from 'vitest';
import { compose, over, PAPER_RGBA } from '../src/core/artCompose';
import { createBlueprint, hashBlueprint } from '../src/core/blueprint';
import { El, rgba } from '../src/core/elements';
import { defaultParams } from '../src/core/params';

const A = (c: number) => c >>> 24;
const R = (c: number) => c & 255;

describe('over()', () => {
  it('opaque top wins, transparent top keeps under', () => {
    expect(over(rgba(10, 20, 30), rgba(200, 200, 200))).toBe(rgba(10, 20, 30));
    expect(over(0, rgba(200, 200, 200))).toBe(rgba(200, 200, 200));
  });

  it('half black over opaque white is mid grey, opaque', () => {
    const c = over(rgba(0, 0, 0, 128), rgba(255, 255, 255));
    expect(A(c)).toBe(255);
    expect(R(c)).toBeGreaterThan(120);
    expect(R(c)).toBeLessThan(135);
  });

  it('half over transparent stays half', () => {
    expect(A(over(rgba(0, 0, 0, 128), 0))).toBe(128);
  });
});

describe('compose()', () => {
  // 3 cells wide, 1 high, k = 2 -> art is 6 x 2
  const k = 2;
  const w = 3;
  const h = 1;
  const ink = rgba(40, 40, 40);
  const half = rgba(40, 40, 40, 128);
  const fg = new Uint32Array(w * k * h * k).fill(ink);
  const bg = new Uint32Array(w * k * h * k).fill(rgba(150, 150, 150));
  fg[1] = half; // one soft edge pixel in cell 0
  const art = { k, fg, bg };
  const bpEl = Uint8Array.from([El.ROCK, El.ROCK, El.EMPTY]);
  const px = (out: Uint32Array, cx: number) => [out[cx * k], out[cx * k + 1], out[w * k + cx * k], out[w * k + cx * k + 1]];

  it('untouched solid cell shows fg over paper (soft pixel not see-through)', () => {
    const out = new Uint32Array(fg.length);
    compose(out, Uint8Array.from([El.ROCK, El.ROCK, El.EMPTY]), bpEl, w, h, art, w);
    expect(px(out, 0)[0]).toBe(ink);
    expect(A(px(out, 0)[1])).toBe(255);
  });

  it('removed cell shows bg only; dynamic element cell is transparent', () => {
    const out = new Uint32Array(fg.length);
    compose(out, Uint8Array.from([El.EMPTY, El.WATER, El.EMPTY]), bpEl, w, h, art, w);
    expect(px(out, 0)).toEqual([bg[0], bg[1], bg[6], bg[7]]);
    expect(px(out, 1)).toEqual([0, 0, 0, 0]);
  });

  it('untouched empty cell shows fg over bg; nothing past the frontier', () => {
    const out = new Uint32Array(fg.length);
    compose(out, Uint8Array.from([El.ROCK, El.ROCK, El.EMPTY]), bpEl, w, h, art, 2);
    expect(px(out, 2)).toEqual([0, 0, 0, 0]);
    compose(out, Uint8Array.from([El.ROCK, El.ROCK, El.EMPTY]), bpEl, w, h, art, 3);
    expect(px(out, 2)[0]).toBe(ink);
  });

  it('PAPER_RGBA is opaque', () => expect(A(PAPER_RGBA)).toBe(255));
});

describe('hashBlueprint with art', () => {
  it('changes when one art pixel changes', () => {
    const bp = createBlueprint(1, defaultParams(), { w: 4, h: 2 });
    bp.bg = new Uint8Array(8);
    bp.art = { k: 2, fg: new Uint32Array(32), bg: new Uint32Array(32) };
    const a = hashBlueprint(bp);
    bp.art.fg[5] = 7;
    expect(hashBlueprint(bp)).not.toBe(a);
  });
});
