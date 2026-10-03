import { getGalleryStore } from './index';
import type { GalleryEntry, NewGalleryEntry } from './types';

export interface WinData {
  levelId: string;
  seed: number;
  params: Record<string, number>;
  actionLog: NewGalleryEntry['actionLog'];
  /** PNG data URL of the final grid. */
  png: string;
  result: NewGalleryEntry['result'];
  scan?: Record<string, unknown> | null;
  worldHash: number;
  appVersion: string;
}

/**
 * Submit a win to the gallery. Called once by the §8 integration; the name
 * prompt UI lives with the caller. Empty/blank names submit anonymously.
 */
export async function submitWin(win: WinData, playerName?: string): Promise<GalleryEntry> {
  const trimmed = playerName?.trim().slice(0, 64) ?? '';
  return getGalleryStore().save({
    playerName: trimmed ? trimmed : null,
    levelId: win.levelId,
    seed: win.seed,
    params: win.params,
    actionLog: win.actionLog,
    png: win.png,
    result: win.result,
    scan: win.scan ?? null,
    worldHash: win.worldHash,
    appVersion: win.appVersion,
  });
}
