import { describe, expect, it } from 'vitest';
import {
  dedupeFeedItems,
  feedLocationLabel,
  paperPageForFeedItem,
  reorderFeedIdsByBook,
  shuffleFeedIds,
  type ReadingFeedItem,
} from './readingFeed';

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

  it('deduplicates exact passages only within the same book', () => {
    const duplicate = { ...items[0], id: 'a-copy' };
    expect(dedupeFeedItems([...items, duplicate])).toHaveLength(3);
    expect(dedupeFeedItems([
      ...items,
      { ...duplicate, filename: 'different.txt', id: 'other-book' },
    ])).toHaveLength(4);
  });

  it('promotes a liked book without grouping all of its passages', () => {
    const catalog: ReadingFeedItem[] = [
      ...items,
      { id: 'a2', bookId: 'book-a', filename: 'a.txt', type: 'txt', title: 'A', text: 'A2', locator: { kind: 'txt' } },
      { id: 'a3', bookId: 'book-a', filename: 'a.txt', type: 'txt', title: 'A', text: 'A3', locator: { kind: 'txt' } },
      { id: 'b2', bookId: 'book-b', filename: 'b.pdf', type: 'pdf', title: 'B', text: 'B2', locator: { kind: 'pdf', page: 13 } },
      { id: 'c2', bookId: 'book-c', filename: 'c.epub', type: 'epub', title: 'C', text: 'C2', locator: { kind: 'epub' } },
      { id: 'b3', bookId: 'book-b', filename: 'b.pdf', type: 'pdf', title: 'B', text: 'B3', locator: { kind: 'pdf', page: 14 } },
      { id: 'c3', bookId: 'book-c', filename: 'c.epub', type: 'epub', title: 'C', text: 'C3', locator: { kind: 'epub' } },
    ];
    const order = reorderFeedIdsByBook(catalog.map((item) => item.id), catalog, 'a.txt', 'more');
    const filenames = order.map((id) => catalog.find((item) => item.id === id)?.filename);

    expect(filenames[0]).toBe('a.txt');
    expect(order).toHaveLength(catalog.length);
    expect(new Set(order)).toEqual(new Set(catalog.map((item) => item.id)));
    for (let index = 1; index < filenames.length; index += 1) {
      expect(filenames[index]).not.toBe(filenames[index - 1]);
    }
  });

  it('keeps “less” reversible by moving a book to the end', () => {
    expect(reorderFeedIdsByBook(['a', 'b', 'c'], items, 'b.pdf', 'less')).toEqual(['a', 'c', 'b']);
  });
});
