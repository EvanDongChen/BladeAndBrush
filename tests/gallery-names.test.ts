import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADJECTIVES, ZODIAC, aliasOf, randomChoice, saveChoice, savedChoice } from '../src/gallery/names';

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
  it('offers a Chinese adjective list and exactly the twelve zodiac animals, in order', () => {
    expect(ZODIAC.map((z) => z.zh).join('')).toBe('鼠牛虎兔龍蛇馬羊猴雞狗豬');
    expect(ZODIAC).toHaveLength(12);
    for (const a of ADJECTIVES) expect(a.zh).toMatch(/^\p{Script=Han}{2}$/u);
    expect(new Set(ADJECTIVES.map((a) => a.zh)).size).toBe(ADJECTIVES.length);
  });

  it('a name is the adjective, 的, and the animal', () => {
    expect(aliasOf({ adjective: 0, zodiac: 2 })).toBe('勇敢的虎');
    expect(aliasOf({ adjective: 1, zodiac: 4 })).toBe('聰明的龍');
  });

  it('every choice makes a distinct, well-formed name', () => {
    const names = new Set<string>();
    for (let a = 0; a < ADJECTIVES.length; a++) for (let z = 0; z < ZODIAC.length; z++) names.add(aliasOf({ adjective: a, zodiac: z }));
    expect(names.size).toBe(ADJECTIVES.length * ZODIAC.length);
    for (const n of names) expect(n).toMatch(/^\p{Script=Han}{2}的\p{Script=Han}$/u);
  });

  it('out-of-range or odd indexes are clamped, never undefined', () => {
    expect(aliasOf({ adjective: -5, zodiac: 99 })).toBe(aliasOf({ adjective: 0, zodiac: ZODIAC.length - 1 }));
    expect(aliasOf({ adjective: Number.NaN, zodiac: 1.7 })).toBe(aliasOf({ adjective: 0, zodiac: 1 }));
  });

  it('a random choice stays in range at both ends of the random source', () => {
    for (const r of [0, 0.5, 0.9999999]) {
      const c = randomChoice(() => r);
      expect(c.adjective).toBeGreaterThanOrEqual(0);
      expect(c.adjective).toBeLessThan(ADJECTIVES.length);
      expect(c.zodiac).toBeLessThan(ZODIAC.length);
    }
  });

  it('remembers the last choice in this browser', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    saveChoice({ adjective: 3, zodiac: 8 });
    expect(savedChoice()).toEqual({ adjective: 3, zodiac: 8 });
  });

  it('starts a new browser from a random pair, and survives damaged or blocked storage', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const first = savedChoice();
    expect(aliasOf(first)).toMatch(/^\p{Script=Han}{2}的\p{Script=Han}$/u);
    storage.setItem('blade-and-brush.name.v1', '{not json');
    expect(aliasOf(savedChoice())).toMatch(/的/u);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(aliasOf(savedChoice())).toMatch(/的/u);
    expect(() => saveChoice({ adjective: 0, zodiac: 0 })).not.toThrow();
  });
});
