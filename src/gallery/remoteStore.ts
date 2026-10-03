import type { GalleryEntry, GalleryStore, NewGalleryEntry } from './types';

/** Delete secrets for remote entries, keyed by entry id. */
const SECRET_KEY = 'blade-and-brush.gallery.secrets.v1';

function readSecrets(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SECRET_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function rememberSecret(id: string, secret: string): void {
  const all = readSecrets();
  all[id] = secret;
  localStorage.setItem(SECRET_KEY, JSON.stringify(all));
}

export function recallSecret(id: string): string | undefined {
  return readSecrets()[id];
}

export function forgetSecret(id: string): void {
  const all = readSecrets();
  delete all[id];
  localStorage.setItem(SECRET_KEY, JSON.stringify(all));
}

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

  async save(entry: NewGalleryEntry): Promise<GalleryEntry> {
    const { entry: saved, deleteSecret } = await this.request<{ entry: GalleryEntry; deleteSecret: string }>(
      '/gallery',
      { method: 'POST', body: JSON.stringify(entry) },
    );
    rememberSecret(saved.id, deleteSecret);
    return saved;
  }

  async remove(id: string, secret?: string): Promise<void> {
    const s = secret ?? recallSecret(id);
    const q = s ? `?secret=${encodeURIComponent(s)}` : '';
    await this.request<void>(`/gallery/${encodeURIComponent(id)}${q}`, { method: 'DELETE' });
    forgetSecret(id);
  }
}
