import type { GalleryEntry, GalleryStore, NewGalleryEntry } from './types';

/**
 * STUB: remote backend for the future database (Tiger Data / Postgres).
 *
 * Browsers cannot speak Postgres directly, so the database sits behind a
 * small server API with this contract:
 *
 *   GET    {base}/gallery?level=<levelId>  -> GalleryEntry[]
 *   GET    {base}/gallery/<id>             -> GalleryEntry
 *   POST   {base}/gallery                 -> GalleryEntry (body: NewGalleryEntry)
 *   DELETE {base}/gallery/<id>             -> 204
 *
 * The server persists entries in Postgres and serves `png` as stored data
 * URLs (or object-store URLs once entries outgrow a row). Auth, paging, and
 * retries are still TODO. Enabled via `VITE_GALLERY_API`; until then the
 * factory below keeps using localStorage.
 */
export class RemoteGalleryStore implements GalleryStore {
  private readonly base: string;

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Gallery API ${res.status} on ${path}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  list(levelId?: string): Promise<GalleryEntry[]> {
    const q = levelId ? `?level=${encodeURIComponent(levelId)}` : '';
    return this.request<GalleryEntry[]>(`/gallery${q}`);
  }

  get(id: string): Promise<GalleryEntry | undefined> {
    return this.request<GalleryEntry>(`/gallery/${encodeURIComponent(id)}`);
  }

  save(entry: NewGalleryEntry): Promise<GalleryEntry> {
    return this.request<GalleryEntry>('/gallery', { method: 'POST', body: JSON.stringify(entry) });
  }

  async remove(id: string): Promise<void> {
    await this.request<void>(`/gallery/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}
