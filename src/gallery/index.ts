import { LocalGalleryStore } from './localStore';
import { RemoteGalleryStore } from './remoteStore';
import type { GalleryStore } from './types';

export type { GalleryEntry, GalleryStore, NewGalleryEntry } from './types';

let current: GalleryStore | undefined;

/**
 * Backend switch. Default is localStorage; setting VITE_GALLERY_API to the
 * server base URL swaps in the Postgres-backed remote store with no caller
 * changes.
 */
export function getGalleryStore(): GalleryStore {
  if (!current) {
    const api = import.meta.env.VITE_GALLERY_API as string | undefined;
    current = api ? new RemoteGalleryStore(api) : new LocalGalleryStore();
  }
  return current;
}

/** For tests: inject a fake backend. */
export function setGalleryStore(store: GalleryStore): void {
  current = store;
}
