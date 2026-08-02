import { describe, expect, it } from 'vitest';
import { feedLocationLabel, paperPageForFeedItem, shuffleFeedIds, type ReadingFeedItem } from './readingFeed';

const items: ReadingFeedItem[] = [
  { id: 'a', bookId: 'book-a', filename: 'a.txt', type: 'txt', title: 'A', text: 'A', locator: { kind: 'txt', label: 'fragmento 1' } },
  { id: 'b', bookId: 'book-b', filename: 'b.pdf', type: 'pdf', title: 'B', text: 'B', locator: { kind: 'pdf', page: 12 } },
  { id: 'c', bookId: 'book-c', filename: 'c.epub', type: 'epub', title: 'C', text: 'C', locator: { kind: 'epub', label: 'Capítulo II' } },
];

describe('reading feed utilities', () => {
  it('keeps a deterministic permutation for a session seed', () => {
    const first = shuffleFeedIds(items, 42);
    expect(shuffleFeedIds(items, 42)).toEqual(first);
    expect(new Set(first)).toEqual(new Set(items.map((item) => item.id)));
  });

  it('formats source locations for the feed', () => {
    expect(feedLocationLabel(items[0].locator)).toBe('fragmento 1');
    expect(feedLocationLabel(items[1].locator)).toBe('p. 12');
    expect(feedLocationLabel(items[2].locator)).toBe('Capítulo II');
  });
  it('maps feed locators to a bounded Paper Soul page', () => {
    expect(paperPageForFeedItem({ kind: 'pdf', page: 12 })).toBe(12);
    expect(paperPageForFeedItem({ kind: 'txt', offset: 500, sourceLength: 1000 })).toBe(21);
    expect(paperPageForFeedItem({ kind: 'epub', paragraph: 50 })).toBe(3);
    expect(paperPageForFeedItem({ kind: 'txt' })).toBe(1);
  });
});
