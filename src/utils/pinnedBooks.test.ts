import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PINNED_BOOKS_CHANGED_EVENT,
  applyPinnedMap,
  getPinnedBookFilenames,
  isBookPinned,
  setBookPinned,
  subscribePinnedBooksChanged,
} from './pinnedBooks';

describe('pinnedBooks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('pins and unpins a book', () => {
    setBookPinned('a.pdf', true);
    expect(isBookPinned('a.pdf')).toBe(true);
    expect(getPinnedBookFilenames()).toEqual(['a.pdf']);

    setBookPinned('a.pdf', false);
    expect(isBookPinned('a.pdf')).toBe(false);
  });

  it('does not duplicate a pinned filename', () => {
    setBookPinned('a.pdf', true);
    setBookPinned('a.pdf', true);
    expect(getPinnedBookFilenames()).toEqual(['a.pdf']);
  });

  it('notifies subscribers', () => {
    const cb = vi.fn();
    const unsub = subscribePinnedBooksChanged(cb);
    setBookPinned('a.pdf', true);
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    expect(PINNED_BOOKS_CHANGED_EVENT).toBe('catreader-pinned-changed');
  });

  it('applies cloud pin map additively', () => {
    setBookPinned('kept.pdf', true);
    const list = applyPinnedMap({ 'kept.pdf': true, 'from-cloud.pdf': true });
    expect(list.sort()).toEqual(['from-cloud.pdf', 'kept.pdf']);
  });

  it('applies cloud unpin', () => {
    setBookPinned('a.pdf', true);
    const list = applyPinnedMap({ 'a.pdf': false });
    expect(list).toEqual([]);
  });
});
