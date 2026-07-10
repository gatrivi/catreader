import { describe, it, expect } from 'vitest';
import {
  clampPage,
  offsetPage,
  isPageInRenderWindow,
  parsePageInput,
  filterLibraryBooks,
  PDF_RENDER_WINDOW,
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
});
