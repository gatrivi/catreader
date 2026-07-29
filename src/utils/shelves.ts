/** Sparse 4×4 shelf slot helpers. Empty = null. */

export const MAX_SLOTS = 16;
export const SHELVES_SPARSE_MIGRATION_KEY = 'catreader_shelves_sparse_v1';

export type SlotId = string | null;

export interface ShelfSlots {
  id: string;
  title: string;
  bookIds: SlotId[];
}

export function emptySlots(): SlotId[] {
  return Array.from({ length: MAX_SLOTS }, () => null);
}

/** Dense or ragged → length-16 sparse. Drops nulls from input when packing overflow out. */
export function toSparseSlots(ids: (string | null | undefined)[] | undefined): SlotId[] {
  const out = emptySlots();
  if (!ids?.length) return out;
  let i = 0;
  for (const id of ids) {
    if (id == null || id === '') continue;
    if (i >= MAX_SLOTS) break;
    out[i++] = id;
  }
  return out;
}

export function occupiedIds(bookIds: SlotId[]): string[] {
  return bookIds.filter((id): id is string => id != null);
}

export function slotCount(bookIds: SlotId[]): number {
  return occupiedIds(bookIds).length;
}

export function firstNullIndex(bookIds: SlotId[]): number {
  return bookIds.findIndex((id) => id == null);
}

export function findSlot(shelves: ShelfSlots[], bookId: string): { shelfId: string; index: number } | null {
  for (const s of shelves) {
    const index = s.bookIds.indexOf(bookId);
    if (index >= 0) return { shelfId: s.id, index };
  }
  return null;
}

export function clearBook(shelves: ShelfSlots[], bookId: string): ShelfSlots[] {
  return shelves.map((s) => ({
    ...s,
    bookIds: s.bookIds.map((id) => (id === bookId ? null : id)),
  }));
}

/** Place book at index. Returns displaced id if slot was occupied. */
export function placeAt(
  shelf: ShelfSlots,
  bookId: string,
  index: number
): { shelf: ShelfSlots; displaced: string | null } {
  const bookIds = [...shelf.bookIds];
  while (bookIds.length < MAX_SLOTS) bookIds.push(null);
  const i = Math.max(0, Math.min(index, MAX_SLOTS - 1));
  for (let j = 0; j < bookIds.length; j++) {
    if (bookIds[j] === bookId) bookIds[j] = null;
  }
  const displaced = bookIds[i] && bookIds[i] !== bookId ? bookIds[i] : null;
  bookIds[i] = bookId;
  return { shelf: { ...shelf, bookIds: bookIds.slice(0, MAX_SLOTS) }, displaced };
}

export function placeInFirstNull(
  shelf: ShelfSlots,
  bookId: string
): { shelf: ShelfSlots; displaced: string | null } | null {
  const hole = firstNullIndex(shelf.bookIds);
  if (hole < 0) return null;
  return placeAt(shelf, bookId, hole);
}

export function emptiestWithHole(shelves: ShelfSlots[]): ShelfSlots | null {
  const open = shelves.filter((s) => firstNullIndex(s.bookIds) >= 0);
  if (!open.length) return null;
  return open.reduce((a, b) => (slotCount(a.bookIds) <= slotCount(b.bookIds) ? a : b));
}

/** Move within one shelf without compacting holes. */
export function reorderSparse(bookIds: SlotId[], fromIndex: number, toIndex: number): SlotId[] {
  const next = [...bookIds];
  while (next.length < MAX_SLOTS) next.push(null);
  const from = Math.max(0, Math.min(fromIndex, MAX_SLOTS - 1));
  const to = Math.max(0, Math.min(toIndex, MAX_SLOTS - 1));
  if (from === to) return next.slice(0, MAX_SLOTS);
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved ?? null);
  // splice changes length — re-pad / trim
  while (next.length < MAX_SLOTS) next.push(null);
  return next.slice(0, MAX_SLOTS);
}

export function migrateShelvesToSparse(shelves: ShelfSlots[]): ShelfSlots[] {
  return shelves.map((s) => ({
    ...s,
    bookIds: toSparseSlots(s.bookIds),
  }));
}

/** Pack occupied ids into shelves at 16 each; spill extras onto later shelves. */
export function packIntoShelves(shelves: ShelfSlots[], bookIds: string[]): ShelfSlots[] {
  const next = shelves.map((s) => ({ ...s, bookIds: emptySlots() }));
  let shelfIdx = 0;
  let slot = 0;
  for (const id of bookIds) {
    while (shelfIdx < next.length && slot >= MAX_SLOTS) {
      shelfIdx++;
      slot = 0;
    }
    if (shelfIdx >= next.length) break; // leftover needs new shelf — caller handles
    next[shelfIdx].bookIds[slot++] = id;
  }
  return next;
}

export function filterDeletedBooks<T extends { filename: string }>(
  books: T[],
  deletedFilenames: Iterable<string>
): T[] {
  const set = deletedFilenames instanceof Set ? deletedFilenames : new Set(deletedFilenames);
  return books.filter((b) => !set.has(b.filename));
}

/** Find shelf by title (case-insensitive) or append one; place book in first hole. */
export function placeOnNamedShelf(
  shelves: ShelfSlots[],
  bookId: string,
  title: string
): ShelfSlots[] {
  if (shelves.some((s) => s.bookIds.includes(bookId))) return shelves;
  const want = title.toLowerCase();
  let next = shelves.map((s) => ({ ...s, bookIds: [...s.bookIds] as SlotId[] }));
  let target = next.find((s) => s.title.toLowerCase() === want);
  if (!target) {
    target = {
      id: `shelf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      bookIds: emptySlots(),
    };
    next = [...next, target];
  }
  const placed = placeInFirstNull(target, bookId);
  if (!placed) {
    // ponytail: named shelf full → spill to emptiest (caller may prefer append)
    const open = emptiestWithHole(next);
    if (!open) return next;
    const again = placeInFirstNull(open, bookId);
    return again ? next.map((s) => (s.id === open.id ? again.shelf : s)) : next;
  }
  return next.map((s) => (s.id === target!.id ? placed.shelf : s));
}

/** ponytail: seed known books onto named shelves (localStorage only). */
export const BOOK_SHELF_PREFS: Record<string, string> = {
  'Cats_Cloud_Crusader-Starter_Canon.txt': "Cat's Cloud Crusader",
};
