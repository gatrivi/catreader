import { describe, it, expect } from 'vitest';
import {
  clampPage,
  offsetPage,
  isPageInRenderWindow,
  parsePageInput,
  filterLibraryBooks,
  PDF_RENDER_WINDOW,
  shouldBlockPageObserver,
  pageElementPrefix,
  loadPageCounts,
  rememberPageCount,
  centerOutOrder,
} from './reader';

describe('reader utils', () => {
  it('clamps page into [1, numPages]', () => {
    expect(clampPage(0, 100)).toBe(1);
    expect(clampPage(-5, 100)).toBe(1);
    expect(clampPage(50, 100)).toBe(50);
    expect(clampPage(200, 100)).toBe(100);
    expect(clampPage(5, 0)).toBe(1);
  });

  it('offsets page without leaving bounds', () => {
    expect(offsetPage(1, -1, 10)).toBe(1);
    expect(offsetPage(5, 1, 10)).toBe(6);
    expect(offsetPage(10, 1, 10)).toBe(10);
  });

  it('keeps render window around current page (perf)', () => {
    expect(isPageInRenderWindow(1, 1)).toBe(true);
    expect(isPageInRenderWindow(1 + PDF_RENDER_WINDOW, 1)).toBe(true);
    expect(isPageInRenderWindow(1 + PDF_RENDER_WINDOW + 1, 1)).toBe(false);
    expect(isPageInRenderWindow(50, 50)).toBe(true);
    expect(isPageInRenderWindow(59, 50)).toBe(false);
  });

  it('parses go-to-page input', () => {
    expect(parsePageInput('20', 100)).toBe(20);
    expect(parsePageInput('0', 100)).toBe(null);
    expect(parsePageInput('101', 100)).toBe(null);
    expect(parsePageInput('abc', 100)).toBe(null);
    expect(parsePageInput('', 100)).toBe(null);
  });

  it('filters library by title/author/filename', () => {
    const books = [
      { title: 'Meditations', author: 'Marcus', filename: 'meditations.pdf' },
      { title: 'Church History', author: 'Eusebius', filename: 'church.pdf' },
    ];
    expect(filterLibraryBooks(books, 'marcus')).toHaveLength(1);
    expect(filterLibraryBooks(books, 'church')).toHaveLength(1);
    expect(filterLibraryBooks(books, 'pdf')).toHaveLength(2);
    expect(filterLibraryBooks(books, 'zzz')).toHaveLength(0);
    expect(filterLibraryBooks(books, '')).toHaveLength(2);
  });

  it('blocks page observer during restore / mode switch', () => {
    expect(shouldBlockPageObserver(true, null)).toBe(true);
    expect(shouldBlockPageObserver(false, 42)).toBe(true);
    expect(shouldBlockPageObserver(false, null)).toBe(false);
  });

  it('picks page DOM prefix for reader vs pdf', () => {
    expect(pageElementPrefix(true, 'pdf')).toBe('text-page-');
    expect(pageElementPrefix(false, 'pdf')).toBe('page-');
    expect(pageElementPrefix(false, 'txt')).toBe('text-page-');
  });
});

describe('page-count memory', () => {
  it('round-trips counts through localStorage', () => {
    rememberPageCount('book.pdf', 320);
    expect(loadPageCounts()['book.pdf']).toBe(320);
  });

  it('ignores invalid entries and corrupt JSON', () => {
    localStorage.setItem('catreader_page_counts', '{"a.pdf": 0, "b.pdf": -3, "c.pdf": "x", "d.pdf": 12.9}');
    expect(loadPageCounts()).toEqual({ 'd.pdf': 12 });
    localStorage.setItem('catreader_page_counts', 'not json{');
    expect(loadPageCounts()).toEqual({});
  });

  it('ignores invalid saves', () => {
    localStorage.removeItem('catreader_page_counts');
    rememberPageCount('', 100);
    rememberPageCount('x.pdf', 0);
    expect(loadPageCounts()).toEqual({});
  });
});

describe('centerOutOrder', () => {
  it('walks outward from center and visits every index once', () => {
    const order = centerOutOrder(7, 3);
    expect(order[0]).toBe(3);
    expect(order).toEqual(expect.arrayContaining([0, 1, 2, 3, 4, 5, 6]));
    expect(new Set(order).size).toBe(7);
  });

  it('clamps an out-of-range center into bounds', () => {
    expect(centerOutOrder(4, 99)[0]).toBe(3);
    expect(centerOutOrder(4, -5)[0]).toBe(0);
  });

  it('handles empty input', () => {
    expect(centerOutOrder(0, 2)).toEqual([]);
  });
});
