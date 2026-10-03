import type { ActionLog } from '../core/replay';

/**
 * A finished painting submitted to the gallery (PLAN.md section 8, step 5:
 * final grid as PNG + ActionLog + seed/params).
 */
export interface GalleryEntry {
  id: string;
  /** Display name, or null for anonymous. */
  playerName: string | null;
  levelId: string;
  seed: number;
  params: Record<string, number>;
  actionLog: ActionLog;
  /** PNG data URL of the final grid. */
  png: string;
  /** Goal outcome at submit time. */
  result: { pass: boolean; progress: number };
  /** Scanner output at submit time, if available. */
  scan: Record<string, unknown> | null;
  /** Deterministic fingerprint of the final grid (PLAN.md section 9). */
  worldHash: number;
  /** Build that produced this entry, for replay compatibility. */
  appVersion: string;
  /** Epoch ms, set by the store on save. */
  createdAt: number;
}

export type NewGalleryEntry = Omit<GalleryEntry, 'id' | 'createdAt'>;

/**
 * Storage backend contract. The game submits through this interface only,
 * so the backend can move from localStorage to a database without touching
 * callers. Future backend: REST API over Postgres (Tiger Data).
 */
export interface GalleryStore {
  list(levelId?: string): Promise<GalleryEntry[]>;
  get(id: string): Promise<GalleryEntry | undefined>;
  /** Resolves with the entry; remote backends also persist a delete secret (see submit.ts). */
  save(entry: NewGalleryEntry): Promise<GalleryEntry>;
  remove(id: string, secret?: string): Promise<void>;
}
