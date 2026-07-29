import { describe, it, expect } from 'vitest';
import {
  MAX_SLOTS,
  emptySlots,
  toSparseSlots,
  occupiedIds,
  firstNullIndex,
  clearBook,
  placeAt,
  placeInFirstNull,
  emptiestWithHole,
  reorderSparse,
  migrateShelvesToSparse,
  packIntoShelves,
  filterDeletedBooks,
  placeOnNamedShelf,
  BOOK_SHELF_PREFS,
  type ShelfSlots,
} from './shelves';

describe('shelves sparse utils', () => {
  it('toSparseSlots pads and caps at 16', () => {
    const dense = Array.from({ length: 20 }, (_, i) => `b${i}`);
    const sparse = toSparseSlots(dense);
    expect(sparse).toHaveLength(MAX_SLOTS);
    expect(occupiedIds(sparse)).toHaveLength(MAX_SLOTS);
    expect(sparse[0]).toBe('b0');
    expect(sparse[15]).toBe('b15');
  });

  it('migrateShelvesToSparse converts dense shelves', () => {
    const shelves: ShelfSlots[] = [
      { id: 's0', title: 'A', bookIds: ['a', 'b'] as unknown as string[] },
    ];
    const migrated = migrateShelvesToSparse(shelves);
    expect(migrated[0].bookIds).toHaveLength(16);
    expect(migrated[0].bookIds[0]).toBe('a');
    expect(migrated[0].bookIds[2]).toBeNull();
  });

  it('placeAt writes exact index and reports displaced', () => {
    const shelf: ShelfSlots = { id: 's', title: 'T', bookIds: emptySlots() };
    shelf.bookIds[3] = 'old';
    const { shelf: next, displaced } = placeAt(shelf, 'new', 3);
    expect(next.bookIds[3]).toBe('new');
    expect(displaced).toBe('old');
  });

  it('placeInFirstNull fills first hole', () => {
    const shelf: ShelfSlots = { id: 's', title: 'T', bookIds: emptySlots() };
    shelf.bookIds[0] = 'a';
    const placed = placeInFirstNull(shelf, 'b');
    expect(placed?.shelf.bookIds[1]).toBe('b');
    expect(firstNullIndex(placed!.shelf.bookIds)).toBe(2);
  });

  it('placeInFirstNull returns null when full', () => {
    const shelf: ShelfSlots = {
      id: 's',
      title: 'T',
      bookIds: Array.from({ length: MAX_SLOTS }, (_, i) => `b${i}`),
    };
    expect(placeInFirstNull(shelf, 'x')).toBeNull();
  });

  it('reorderSparse moves without compacting holes', () => {
    const ids = emptySlots();
    ids[0] = 'a';
    ids[2] = 'b';
    const next = reorderSparse(ids, 0, 2);
    expect(next[0]).toBeNull();
    expect(next[1]).toBe('b');
    expect(next[2]).toBe('a');
  });

  it('clearBook nulls all matching slots', () => {
    const shelves: ShelfSlots[] = [
      { id: 's0', title: 'A', bookIds: toSparseSlots(['a', 'b']) },
      { id: 's1', title: 'B', bookIds: toSparseSlots(['c']) },
    ];
    const next = clearBook(shelves, 'b');
    expect(next[0].bookIds[1]).toBeNull();
    expect(next[0].bookIds[0]).toBe('a');
  });

  it('emptiestWithHole prefers fewer occupied', () => {
    const shelves: ShelfSlots[] = [
      { id: 'fullish', title: 'A', bookIds: toSparseSlots(Array.from({ length: 10 }, (_, i) => `a${i}`)) },
      { id: 'empty', title: 'B', bookIds: emptySlots() },
    ];
    expect(emptiestWithHole(shelves)?.id).toBe('empty');
  });

  it('packIntoShelves respects 16 per shelf', () => {
    const shelves: ShelfSlots[] = [
      { id: 's0', title: 'A', bookIds: emptySlots() },
      { id: 's1', title: 'B', bookIds: emptySlots() },
    ];
    const ids = Array.from({ length: 20 }, (_, i) => `b${i}`);
    const packed = packIntoShelves(shelves, ids);
    expect(occupiedIds(packed[0].bookIds)).toHaveLength(16);
    expect(occupiedIds(packed[1].bookIds)).toHaveLength(4);
  });

  it('filterDeletedBooks keeps deleted out', () => {
    const books = [
      { filename: 'keep.pdf', title: 'Keep' },
      { filename: 'gone.pdf', title: 'Gone' },
    ];
    expect(filterDeletedBooks(books, ['gone.pdf']).map((b) => b.filename)).toEqual(['keep.pdf']);
  });

  it('placeOnNamedShelf creates shelf and seeds book', () => {
    const shelves: ShelfSlots[] = [{ id: 's0', title: 'Church', bookIds: emptySlots() }];
    const next = placeOnNamedShelf(shelves, 'Cats_Cloud_Crusader-Starter_Canon.txt', "Cat's Cloud Crusader");
    expect(next).toHaveLength(2);
    expect(next[1].title).toBe("Cat's Cloud Crusader");
    expect(next[1].bookIds[0]).toBe('Cats_Cloud_Crusader-Starter_Canon.txt');
    expect(BOOK_SHELF_PREFS['Cats_Cloud_Crusader-Starter_Canon.txt']).toBe("Cat's Cloud Crusader");
  });
});
