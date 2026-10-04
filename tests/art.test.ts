import { describe, expect, it } from 'vitest';
import { compose, over, PAPER_RGBA, prepareArt } from '../src/core/artCompose';
import { createBlueprint, hashBlueprint, type ArtView } from '../src/core/blueprint';
import { NO_PLANE } from '../src/core/constants';
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

describe('compose() with layered planes', () => {
  // 4 cells in a row, k = 1, two planes: 0 (objects, a tree) in front of 1 (terrain, rock).
  //   cell 0: tree over rock   cell 1: rock only   cell 2: nothing   cell 3: tree over nothing
  const w = 4;
  const tree = rgba(10, 80, 10);
  const rock = rgba(90, 90, 90);
  const bgc = rgba(150, 150, 170, 120);
  const view: ArtView = {
    art: { k: 1, planes: [Uint32Array.from([tree, 0, 0, tree]), Uint32Array.from([rock, rock, 0, 0])], bg: new Uint32Array(w).fill(bgc) },
    w,
    h: 1,
    el: Uint8Array.from([El.TREE, El.ROCK, El.EMPTY, El.TREE]),
    plane: Uint8Array.from([0, 1, NO_PLANE, 0]),
    planes: [
      { el: Uint8Array.from([El.TREE, 0, 0, El.TREE]), owner: new Uint16Array(w) },
      { el: Uint8Array.from([El.ROCK, El.ROCK, 0, 0]), owner: new Uint16Array(w) },
    ],
  };
  const run = (el: number[], plane: number[], fx = w) => {
    const out = new Uint32Array(w);
    compose(out, Uint8Array.from(el), Uint8Array.from(plane), prepareArt(view), fx);
    return Array.from(out);
  };

  it('an untouched world is the as-generated picture', () => {
    const out = run([El.TREE, El.ROCK, El.EMPTY, El.TREE], [0, 1, NO_PLANE, 0]);
    expect(out[0]).toBe(tree);
    expect(out[1]).toBe(rock);
    expect(A(out[2])).toBe(A(bgc)); // sky: the background plane only
  });

  it('breaking the tree brings the rock behind it forward', () => {
    expect(run([El.ROCK, El.ROCK, El.EMPTY, El.TREE], [1, 1, NO_PLANE, 0])[0]).toBe(rock);
  });

  it('breaking everything at a cell leaves the background', () => {
    const out = run([El.EMPTY, El.ROCK, El.EMPTY, El.TREE], [NO_PLANE, 1, NO_PLANE, 0]);
    expect(out[0]).toBe(over(bgc, 0));
    // a tree standing over nothing: breaking it shows the background too
    expect(run([El.TREE, El.ROCK, El.EMPTY, El.EMPTY], [0, 1, NO_PLANE, NO_PLANE])[3]).toBe(over(bgc, 0));
  });

  it('dynamic cells are transparent so their own color shows; nothing is drawn past the frontier', () => {
    expect(run([El.WATER, El.ROCK, El.EMPTY, El.TREE], [NO_PLANE, 1, NO_PLANE, 0])[0]).toBe(0);
    const clipped = run([El.TREE, El.ROCK, El.EMPTY, El.TREE], [0, 1, NO_PLANE, 0], 2);
    expect(clipped[2]).toBe(0);
    expect(clipped[3]).toBe(0);
  });

  it('solid cells sit on paper, so a soft edge never lets the flat cell color through', () => {
    const soft = rgba(40, 40, 40, 128);
    const v: ArtView = { ...view, art: { ...view.art, planes: [new Uint32Array(w), Uint32Array.from([soft, 0, 0, 0])], bg: new Uint32Array(w) } };
    const out = new Uint32Array(w);
    compose(out, Uint8Array.from([El.TREE, El.ROCK, El.EMPTY, El.TREE]), Uint8Array.from([0, 1, NO_PLANE, 0]), prepareArt(v), w);
    expect(A(out[0])).toBe(255);
    expect(out[0]).toBe(over(soft, PAPER_RGBA));
  });
});

describe('hashBlueprint with planes', () => {
  it('changes when one art pixel changes', () => {
    const bp = createBlueprint(1, defaultParams(), { w: 4, h: 2 });
    bp.bg = new Uint8Array(8);
    bp.art = { k: 2, planes: [new Uint32Array(32), new Uint32Array(32)], bg: new Uint32Array(32) };
    const a = hashBlueprint(bp);
    bp.art.planes[1][5] = 7;
    expect(hashBlueprint(bp)).not.toBe(a);
  });
});
