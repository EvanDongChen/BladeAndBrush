import type { GalleryEntry, GalleryStore, NewGalleryEntry } from './types';

const KEY = 'blade-and-brush.gallery.v1';

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `entry-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function readAll(): GalleryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GalleryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: GalleryEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

/** Default backend: browser localStorage. No server needed. */
export class LocalGalleryStore implements GalleryStore {
  async list(levelId?: string): Promise<GalleryEntry[]> {
    const all = readAll().sort((a, b) => b.createdAt - a.createdAt);
    return levelId ? all.filter((e) => e.levelId === levelId) : all;
  }

  async get(id: string): Promise<GalleryEntry | undefined> {
    return readAll().find((e) => e.id === id);
  }

  async save(entry: NewGalleryEntry): Promise<GalleryEntry> {
    const saved: GalleryEntry = { ...entry, id: makeId(), createdAt: Date.now() };
    const all = readAll();
    all.push(saved);
    writeAll(all);
    return saved;
  }

  async remove(id: string): Promise<void> {
    writeAll(readAll().filter((e) => e.id !== id));
  }
}
