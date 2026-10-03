import { describe, expect, it } from 'vitest';
import { El, ELEMENTS, type CellView } from '../src/core/elements';

const view = (over: Partial<CellView>): CellView => ({ x: 10, y: 10, el: 0, life: 0, aux: 128, owner: 0, flags: 0, tick: 0, ...over });
const color = (el: number, over: Partial<CellView>) => ELEMENTS[el]!.color(view({ el, ...over }));
const luma = (c: number) => (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11;

describe('animated looks', () => {
  it('water shimmers: the same cell changes color over time, deterministically', () => {
    const colors = new Set<number>();
    for (let tick = 0; tick < 240; tick++) colors.add(color(El.WATER, { tick }));
    expect(colors.size).toBeGreaterThan(20);
    expect(color(El.WATER, { tick: 77 })).toBe(color(El.WATER, { tick: 77 }));
  });

  it('water shimmer stays blue and has the odd bright glint', () => {
    let glints = 0;
    for (let x = 0; x < 200; x++) {
      const c = color(El.WATER, { x, tick: 40 });
      const [r, , b] = [c & 255, (c >>> 8) & 255, (c >>> 16) & 255];
      if (luma(c) > 190) glints++;
      else expect(b).toBeGreaterThan(r); // blue-ish
    }
    expect(glints).toBeGreaterThan(0);
    expect(glints).toBeLessThan(20);
  });

  it('fire goes from bright yellow-white through orange to dark red as its life runs out', () => {
    // use many cells so per-cell flicker averages out
    const avg = (life: number, aux: number) => {
      let sum = 0;
      for (let x = 0; x < 64; x++) sum += luma(color(El.FIRE, { x, life, aux, tick: 6 }));
      return sum / 64;
    };
    for (const aux of [0, El.TREE]) {
      const fresh = avg(aux === 0 ? 40 : 90, aux);
      const middle = avg(aux === 0 ? 14 : 26, aux);
      const dying = avg(2, aux);
      expect(fresh).toBeGreaterThan(middle);
      expect(middle).toBeGreaterThan(dying);
    }
    const fresh = color(El.FIRE, { life: 200, aux: 0 });
    const dying = color(El.FIRE, { life: 0, aux: 0, x: 0, y: 0 });
    expect(((fresh >>> 16) & 255)).toBeGreaterThan(120); // blue channel: near white-hot
    expect(((dying >>> 8) & 255)).toBeLessThan(60); // green channel: red ember
  });

  it('fire flickers: a cell with steady life still changes shade between ticks', () => {
    const colors = new Set<number>();
    for (let tick = 0; tick < 60; tick++) colors.add(color(El.FIRE, { life: 14, aux: 0, tick }));
    expect(colors.size).toBeGreaterThan(3);
  });
});
