import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { World } from '../src/core/world';
import { scan } from '../src/gen/scan';
import './helpers';

describe('trees metric (counted by owner)', () => {
  it('two touching trees count as two', () => {
    const w = new World({ w: 10, h: 10 }, 1);
    for (let y = 2; y < 8; y++) {
      w.set(3, y, El.TREE, { owner: 5 });
      w.set(4, y, El.TREE, { owner: 6 });
    }
    expect(scan(w).counts.trees).toBe(2);
  });

  it('a tree split in two by a slash still counts once', () => {
    const w = new World({ w: 10, h: 10 }, 1);
    w.set(3, 2, El.TREE, { owner: 9 });
    w.set(3, 7, El.TREE, { owner: 9 });
    expect(scan(w).counts.trees).toBe(1);
  });

  it('a fully burnt tree stops counting', () => {
    const w = new World({ w: 10, h: 10 }, 1);
    w.set(3, 2, El.TREE, { owner: 9 });
    w.set(3, 2, El.ASH);
    expect(scan(w).counts.trees).toBe(0);
  });
});

describe('trees metric fallback', () => {
  it('unowned TREE cells count by connected blobs', () => {
    const w = new World({ w: 10, h: 10 }, 1);
    w.set(1, 1, El.TREE);
    w.set(1, 2, El.TREE);
    w.set(6, 6, El.TREE);
    expect(scan(w).counts.trees).toBe(2);
  });
});
