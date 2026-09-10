/** Index of book files cached in IndexedDB — shared by the LRU in db.ts and library badges. */

export const CONTENT_CACHE_INDEX_KEY = 'catreader_content_cache_list';
export const CONTENT_CACHE_CHANGED_EVENT = 'catreader-content-cache-changed';

export interface ContentCacheEntry {
  /** Book filename */
  f: string;
  /** Blob size in bytes (legacy entries were plain filename strings) */
  s: number;
}

/** Migrates the old plain-string entry format to `{f, s}` with a conservative size guess. */
export function readContentCacheIndex(): ContentCacheEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(CONTENT_CACHE_INDEX_KEY) || '[]');
    const entries = Array.isArray(stored) ? stored : [];
    const list: ContentCacheEntry[] = [];
    for (const e of entries) {
      if (typeof e === 'string') {
        list.push({ f: e, s: 25 * 1024 * 1024 });
      } else if (typeof e === 'object' && e !== null && 'f' in e && typeof e.f === 'string') {
        const size = 's' in e ? e.s : undefined;
        list.push({ f: e.f, s: typeof size === 'number' ? size : 0 });
      }
    }
    return list;
  } catch {
    return [];
  }
}

export function writeContentCacheIndex(entries: ContentCacheEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CONTENT_CACHE_INDEX_KEY, JSON.stringify(entries));
  } catch { /* Badge index is best-effort; blobs live in IndexedDB. */ }
}

export function getCachedFilenames(): Set<string> {
  return new Set(readContentCacheIndex().map((e) => e.f));
}

export function notifyContentCacheChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONTENT_CACHE_CHANGED_EVENT));
}

export function subscribeContentCacheChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CONTENT_CACHE_CHANGED_EVENT, cb);
  return () => window.removeEventListener(CONTENT_CACHE_CHANGED_EVENT, cb);
}
