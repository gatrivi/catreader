import { describe, it, expect } from 'vitest';
import {
  GHOST_WINDOW,
  pagesNeededAround,
  missingGhostPages,
  emptyGhostPages,
  applyGhostPages,
} from './ghostText';

describe('ghostText lazy window', () => {
  it('windows around synced page, not page 1', () => {
    expect(pagesNeededAround(100, 200, 2)).toEqual([98, 99, 100, 101, 102]);
    expect(pagesNeededAround(1, 50, 2)).toEqual([1, 2, 3]);
    expect(pagesNeededAround(50, 50, 2)).toEqual([48, 49, 50]);
  });

  it('default window is GHOST_WINDOW', () => {
    expect(pagesNeededAround(10, 20)).toHaveLength(GHOST_WINDOW * 2 + 1);
  });

  it('missingGhostPages skips filled slots', () => {
    const pages = emptyGhostPages(5);
    pages[2] = '<p>x</p>';
    expect(missingGhostPages(pages, [1, 2, 3, 4])).toEqual([1, 2, 4]);
  });

  it('applyGhostPages writes 1-based keys', () => {
    const pages = emptyGhostPages(3);
    expect(applyGhostPages(pages, { 2: '<p>hi</p>' })[1]).toBe('<p>hi</p>');
  });
});
