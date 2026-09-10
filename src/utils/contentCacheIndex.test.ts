import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CONTENT_CACHE_CHANGED_EVENT,
  CONTENT_CACHE_INDEX_KEY,
  getCachedFilenames,
  notifyContentCacheChanged,
  readContentCacheIndex,
  subscribeContentCacheChanged,
  writeContentCacheIndex,
} from './contentCacheIndex';

describe('contentCacheIndex', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads filenames from the index', () => {
    writeContentCacheIndex([
      { f: 'a.pdf', s: 100 },
      { f: 'b.epub', s: 200 },
    ]);
    expect(getCachedFilenames()).toEqual(new Set(['a.pdf', 'b.epub']));
  });

  it('migrates legacy plain-string entries', () => {
    localStorage.setItem(CONTENT_CACHE_INDEX_KEY, JSON.stringify(['old.pdf', 'newer.pdf']));
    const list = readContentCacheIndex();
    expect(list).toEqual([
      { f: 'old.pdf', s: 25 * 1024 * 1024 },
      { f: 'newer.pdf', s: 25 * 1024 * 1024 },
    ]);
  });

  it('survives corrupt JSON', () => {
    localStorage.setItem(CONTENT_CACHE_INDEX_KEY, '{not json');
    expect(readContentCacheIndex()).toEqual([]);
    expect(getCachedFilenames().size).toBe(0);
  });

  it('notifies subscribers on change', () => {
    const cb = vi.fn();
    const unsub = subscribeContentCacheChanged(cb);
    notifyContentCacheChanged();
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    notifyContentCacheChanged();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(CONTENT_CACHE_CHANGED_EVENT).toBe('catreader-content-cache-changed');
  });
});
