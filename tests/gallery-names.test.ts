import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerAlias, randomAlias } from '../src/gallery/names';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gallery names', () => {
  it('a name is two Chinese words, each two characters, with a space between', () => {
    for (let i = 0; i < 50; i++) expect(randomAlias()).toMatch(/^\p{Script=Han}{2} \p{Script=Han}{2}$/u);
  });

  it('is repeatable from a fixed random source, and the ends of the range both work', () => {
    expect(randomAlias(() => 0)).toBe(randomAlias(() => 0));
    expect(randomAlias(() => 0.9999999)).toMatch(/^\p{Script=Han}{2} \p{Script=Han}{2}$/u);
  });

  it('different random draws give different names', () => {
    const names = new Set(Array.from({ length: 200 }, () => randomAlias()));
    expect(names.size).toBeGreaterThan(50);
  });

  it('a browser keeps its name between calls', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const first = playerAlias();
    expect(first).toMatch(/^\p{Script=Han}{2} \p{Script=Han}{2}$/u);
    expect(playerAlias()).toBe(first);
  });

  it('still gives a name when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(playerAlias()).toMatch(/^\p{Script=Han}{2} \p{Script=Han}{2}$/u);
  });
});
