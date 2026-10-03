import type { ActionLog } from '../core/replay';

/**
 * A finished painting submitted to the gallery (PLAN.md section 8, step 5:
 * final grid as PNG + ActionLog + seed/params).
 */
export interface GalleryEntry {
  id: string;
  levelId: string;
  seed: number;
  params: Record<string, number>;
  actionLog: ActionLog;
  /** PNG data URL of the final grid. */
  png: string;
  /** Goal outcome at submit time. */
  result: { pass: boolean; progress: number };
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
  save(entry: NewGalleryEntry): Promise<GalleryEntry>;
  remove(id: string): Promise<void>;
}
