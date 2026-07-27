import { useState, useEffect, useCallback } from 'react';
import {
  MAX_SLOTS,
  SHELVES_SPARSE_MIGRATION_KEY,
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
  type SlotId,
} from '../utils/shelves';

export interface Shelf {
  id: string;
  title: string;
  bookIds: SlotId[];
}

const STORAGE_KEY = 'catreader_shelves_v2';

function defaultShelves(): Shelf[] {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `shelf-${i}`,
    title: i === 0 ? 'Church' : i === 1 ? 'Meditation' : i === 2 ? 'Other' : `Shelf ${i + 1}`,
    bookIds: emptySlots(),
  }));
}

function ensureSparse(shelves: Shelf[]): Shelf[] {
  return shelves.map((s) => ({
    ...s,
    bookIds: s.bookIds.length === MAX_SLOTS ? s.bookIds : toSparseSlots(s.bookIds),
  }));
}

/** Spill book into emptiest shelf with a hole; appends a new shelf if all full. */
function spillBook(shelves: Shelf[], bookId: string): Shelf[] {
  if (shelves.some((s) => s.bookIds.includes(bookId))) return shelves;
  const target = emptiestWithHole(shelves);
  if (target) {
    const placed = placeInFirstNull(target, bookId);
    if (!placed) return shelves;
    return shelves.map((s) => (s.id === target.id ? placed.shelf : s));
  }
  const fresh: Shelf = {
    id: `shelf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: `Shelf ${shelves.length + 1}`,
    bookIds: emptySlots(),
  };
  fresh.bookIds[0] = bookId;
  return [...shelves, fresh];
}

function applyPlace(shelves: Shelf[], shelfId: string, bookId: string, index: number): Shelf[] {
  const target = shelves.find((s) => s.id === shelfId);
  if (!target) return spillBook(shelves, bookId);
  const { shelf, displaced } = placeAt(target, bookId, index);
  let next = shelves.map((s) => (s.id === shelfId ? shelf : s));
  if (displaced) next = spillBook(next, displaced);
  return next;
}

export function useShelves(library: Array<{ id: string }>) {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const legacyMigrationKey = 'catreader_migration_v2.7.5';
    const hasLegacyMigrated = localStorage.getItem(legacyMigrationKey);
    const hasSparseMigrated = localStorage.getItem(SHELVES_SPARSE_MIGRATION_KEY);

    if (stored) {
      try {
        let parsed: Shelf[] = JSON.parse(stored);

        if (!hasLegacyMigrated && Array.isArray(parsed)) {
          console.log('[Migration] Applying Gaston reorganization...');
          const allBooks = parsed.flatMap((s) => occupiedIds(s.bookIds ?? []));
          parsed = parsed.map((s, i) => ({
            ...s,
            title: i === 0 ? 'Church' : i === 1 ? 'Meditation' : i === 2 ? 'Other' : s.title,
            bookIds: emptySlots() as SlotId[],
          }));
          allBooks.forEach((id, idx) => {
            const shelfIdx = Math.min(Math.floor(idx / MAX_SLOTS), 2);
            if (parsed[shelfIdx]) {
              const slot = firstNullIndex(parsed[shelfIdx].bookIds);
              if (slot >= 0) parsed[shelfIdx].bookIds[slot] = id;
            }
          });
          localStorage.setItem(legacyMigrationKey, 'true');
          localStorage.setItem(SHELVES_SPARSE_MIGRATION_KEY, 'true');
          setShelves(ensureSparse(parsed));
          setInitialized(true);
          return;
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!hasSparseMigrated) {
            parsed = migrateShelvesToSparse(parsed);
            localStorage.setItem(SHELVES_SPARSE_MIGRATION_KEY, 'true');
          } else {
            parsed = ensureSparse(parsed);
          }
          setShelves(parsed);
          setInitialized(true);
          return;
        }
      } catch (e) {
        console.error('Failed to parse shelves:', e);
      }
    }

    setShelves(defaultShelves());
    localStorage.setItem(SHELVES_SPARSE_MIGRATION_KEY, 'true');
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized || library.length === 0 || shelves.length === 0) return;

    const libraryIds = new Set(library.map((b) => b.id));
    const assignedIds = new Set(shelves.flatMap((s) => occupiedIds(s.bookIds)));
    const unassigned = library.filter((b) => !assignedIds.has(b.id));
    const hasStale = shelves.some((s) => s.bookIds.some((id) => id != null && !libraryIds.has(id)));

    if (unassigned.length === 0 && !hasStale) return;

    setShelves((prev) => {
      let next = prev.map((s) => ({
        ...s,
        bookIds: s.bookIds.map((id) => (id != null && libraryIds.has(id) ? id : null)),
      }));
      for (const book of unassigned) {
        next = spillBook(next, book.id);
      }
      return next;
    });
  }, [library, initialized]);

  useEffect(() => {
    if (initialized && shelves.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shelves));
    }
  }, [shelves, initialized]);

  const updateShelfTitle = useCallback((shelfId: string, title: string) => {
    setShelves((prev) => prev.map((s) => (s.id === shelfId ? { ...s, title } : s)));
  }, []);

  const moveBook = useCallback(
    (bookId: string, fromShelfId: string, toShelfId: string, toIndex?: number) => {
      setShelves((prev) => {
        const next = clearBook(prev, bookId) as Shelf[];
        const to = next.find((s) => s.id === toShelfId);
        if (!to) return spillBook(next, bookId);

        if (toIndex != null) {
          return applyPlace(next, toShelfId, bookId, toIndex);
        }

        const placed = placeInFirstNull(to, bookId);
        if (placed) {
          let out = next.map((s) => (s.id === toShelfId ? placed.shelf : s));
          if (placed.displaced) out = spillBook(out, placed.displaced);
          return out;
        }
        return spillBook(next, bookId);
      });
    },
    []
  );

  const reorderBook = useCallback((shelfId: string, fromIndex: number, toIndex: number) => {
    setShelves((prev) =>
      prev.map((s) =>
        s.id === shelfId ? { ...s, bookIds: reorderSparse(s.bookIds, fromIndex, toIndex) } : s
      )
    );
  }, []);

  const addShelf = useCallback(() => {
    setShelves((prev) => [
      ...prev,
      { id: `shelf-${Date.now()}`, title: `Shelf ${prev.length + 1}`, bookIds: emptySlots() },
    ]);
  }, []);

  const removeShelf = useCallback((shelfId: string) => {
    setShelves((prev) => {
      const target = prev.find((s) => s.id === shelfId);
      if (!target) return prev;
      const remaining = prev.filter((s) => s.id !== shelfId);
      if (remaining.length === 0) return prev;
      let next = remaining.map((s) => ({ ...s, bookIds: [...s.bookIds] as SlotId[] }));
      for (const id of occupiedIds(target.bookIds)) {
        next = spillBook(next, id);
      }
      return next;
    });
  }, []);

  const consolidateShelves = useCallback(() => {
    setShelves((prev) => {
      const allBooks = prev.flatMap((s) => occupiedIds(s.bookIds));
      let next = prev.map((s, i) => ({
        ...s,
        title: i === 0 ? 'Church' : i === 1 ? 'Meditation' : i === 2 ? 'Other' : s.title,
        bookIds: emptySlots(),
      }));
      next = packIntoShelves(next, allBooks);
      // spill leftovers that didn't fit existing shelves
      const placed = new Set(next.flatMap((s) => occupiedIds(s.bookIds)));
      for (const id of allBooks) {
        if (!placed.has(id)) next = spillBook(next, id);
      }
      return next;
    });
  }, []);

  return { shelves, updateShelfTitle, moveBook, reorderBook, consolidateShelves, addShelf, removeShelf };
}
