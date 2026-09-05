import { describe, it, expect } from 'vitest';
import {
  pagesNeededAround,
  missingGhostPages,
  incompleteGhostPages,
  emptyGhostPages,
  applyGhostPages,
  firstWordHtml,
  snippetHtml,
  isGhostDraft,
  isGhostComplete,
  joinTextItems,
  GHOST_DRAFT_CLASS,
} from './ghostText';

const tc = (words: string[]) => ({ items: words.map((str) => ({ str })) });

describe('ghostText progressive', () => {
  it('window 0 is only center page', () => {
    expect(pagesNeededAround(100, 200, 0)).toEqual([100]);
  });

  it('prefetch window expands', () => {
    expect(pagesNeededAround(100, 200, 1)).toEqual([99, 100, 101]);
  });

  it('firstWordHtml paints one word as draft', () => {
    const html = firstWordHtml(tc(['Hello', ' world']));
    expect(html).toContain(GHOST_DRAFT_CLASS);
    expect(html).toContain('Hello');
    expect(isGhostDraft(html)).toBe(true);
    expect(isGhostComplete(html)).toBe(false);
  });

  it('snippetHtml is still draft until semantic upgrade', () => {
    const html = snippetHtml(tc(['One', ' two', ' three']), 8);
    expect(isGhostDraft(html)).toBe(true);
  });

  it('incomplete includes drafts; missing only empties', () => {
    const pages = emptyGhostPages(3);
    pages[0] = firstWordHtml(tc(['A']));
    pages[1] = '<p>full</p>';
    expect(missingGhostPages(pages, [1, 2, 3])).toEqual([3]);
    expect(incompleteGhostPages(pages, [1, 2, 3])).toEqual([1, 3]);
  });

  it('joinTextItems spaces words', () => {
    expect(joinTextItems(tc(['Cassian', 'Conferences']))).toBe('Cassian Conferences');
  });

  it('applyGhostPages writes 1-based keys', () => {
    const pages = emptyGhostPages(3);
    expect(applyGhostPages(pages, { 2: '<p>hi</p>' })[1]).toBe('<p>hi</p>');
  });
});


it('holds restoration for an empty/draft page, but releases for readable text or a retryable error', async () => {
  const { isGhostReadyForRestore, GHOST_ERROR_HTML, isGhostComplete } = await import('./ghostText');
  expect(isGhostReadyForRestore('')).toBe(false);
  expect(isGhostReadyForRestore('<p class="ghost-draft">Loading</p>')).toBe(false);
  expect(isGhostReadyForRestore('<p>Actual page text</p>')).toBe(true);
  expect(isGhostReadyForRestore(GHOST_ERROR_HTML)).toBe(true);
  expect(isGhostComplete(GHOST_ERROR_HTML)).toBe(false);
});
