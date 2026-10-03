import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGalleryStore, setGalleryStore } from '../src/gallery';
import { LocalGalleryStore } from '../src/gallery/localStore';
import { RemoteGalleryStore } from '../src/gallery/remoteStore';
import { submitWin } from '../src/gallery/submit';
import type { GalleryEntry, GalleryStore, NewGalleryEntry } from '../src/gallery/types';

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

const draft: NewGalleryEntry = {
  playerName: 'Ada',
  levelId: 'demo',
  seed: 7,
  params: {},
  actionLog: [],
  png: 'data:image/png;base64,AAA',
  result: { pass: true, progress: 1 },
  scan: null,
  worldHash: 1,
  appVersion: 'test',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LocalGalleryStore', () => {
  it('round-trips entries', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const store = new LocalGalleryStore();
    const saved = await store.save(draft);
    expect(saved.id).toBeTruthy();
    expect(await store.list()).toHaveLength(1);
    expect(await store.get(saved.id)).toMatchObject({ levelId: 'demo' });
    await store.remove(saved.id);
    expect(await store.list()).toHaveLength(0);
  });
});

describe('RemoteGalleryStore', () => {
  it('unwraps the entry, remembers the secret, and sends it on remove', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const seen: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push({ url, init });
        if (init?.method === 'POST') {
          return {
            ok: true,
            json: async () => ({ entry: { ...draft, id: 'e1', createdAt: 1 }, deleteSecret: 's3cr3t' }),
          };
        }
        return { ok: true, status: 204, json: async () => undefined };
      }),
    );
    const store = new RemoteGalleryStore('http://api.test/api');
    const saved = await store.save(draft);
    expect(saved.id).toBe('e1');
    expect(seen[0].url).toBe('http://api.test/api/gallery');
    expect(storage.getItem('blade-and-brush.gallery.secrets.v1')).toContain('s3cr3t');
    await store.remove('e1');
    expect(seen[1].url).toBe('http://api.test/api/gallery/e1?secret=s3cr3t');
  });
});

describe('submitWin', () => {
  it('blanks names to anonymous and passes everything through', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    let got: NewGalleryEntry | undefined;
    const fake: GalleryStore = {
      list: async () => [],
      get: async () => undefined,
      save: async (e) => {
        got = e;
        return { ...e, id: 'x', createdAt: 0 } as GalleryEntry;
      },
      remove: async () => {},
    };
    setGalleryStore(fake);
    await submitWin(
      {
        levelId: 'demo',
        seed: 7,
        params: {},
        actionLog: [],
        png: 'data:image/png;base64,AAA',
        result: { pass: true, progress: 1 },
        worldHash: 1,
        appVersion: 'test',
      },
      '   ',
    );
    expect(got?.playerName).toBeNull();
    expect(getGalleryStore()).toBe(fake);
  });
});
