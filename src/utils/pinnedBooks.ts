/** Pinned ("keep on device") books — never evicted by the content LRU, synced via cloud metadata. */

import { notifyContentCacheChanged } from './contentCacheIndex';

const PINNED_KEY = 'catreader_pinned_books';
export const PINNED_BOOKS_CHANGED_EVENT = 'catreader-pinned-changed';

export function getPinnedBookFilenames(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PINNED_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

export function isBookPinned(filename: string): boolean {
  return getPinnedBookFilenames().includes(filename);
}

/** Returns the updated pin list and fires change notifications. */
export function setBookPinned(filename: string, pinned: boolean): string[] {
  const list = getPinnedBookFilenames().filter((f) => f !== filename);
  if (pinned) list.push(filename);
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(list));
  } catch { /* Best-effort; eviction just re-downloads. */ }
  notifyContentCacheChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PINNED_BOOKS_CHANGED_EVENT));
  }
  return list;
}

/** Bulk-apply cloud pin state (filename → pinned). Only touches entries present in the map. */
export function applyPinnedMap(map: Record<string, boolean | undefined>): string[] {
  const list = getPinnedBookFilenames();
  let changed = false;
  for (const [filename, pinned] of Object.entries(map)) {
    if (pinned === undefined) continue;
    const has = list.includes(filename);
    if (pinned && !has) {
      list.push(filename);
      changed = true;
    } else if (!pinned && has) {
      list.splice(list.indexOf(filename), 1);
      changed = true;
    }
  }
  if (changed) {
    try {
      localStorage.setItem(PINNED_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
    notifyContentCacheChanged();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PINNED_BOOKS_CHANGED_EVENT));
    }
  }
  return list;
}

export function subscribePinnedBooksChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PINNED_BOOKS_CHANGED_EVENT, cb);
  return () => window.removeEventListener(PINNED_BOOKS_CHANGED_EVENT, cb);
}
