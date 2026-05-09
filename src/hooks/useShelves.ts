import { useState, useEffect, useCallback } from 'react';

export interface Shelf {
  id: string;
  title: string;
  bookIds: string[];
}

const STORAGE_KEY = 'catreader_shelves_v2';

export function useShelves(library: Array<{ id: string }>) {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Load shelves from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setShelves(parsed);
          setInitialized(true);
          return;
        }
      } catch (e) {
        console.error('Failed to parse shelves:', e);
      }
    }

    // Create default 8 shelves
    const defaultShelves: Shelf[] = Array.from({ length: 8 }, (_, i) => ({
      id: `shelf-${i}`,
      title: i === 0 ? 'Reading' : i === 1 ? 'To Read' : i === 2 ? 'Favorites' : `Shelf ${i + 1}`,
      bookIds: []
    }));
    setShelves(defaultShelves);
    setInitialized(true);
  }, []);

  // Auto-distribute unassigned books when library or shelves change
  useEffect(() => {
    if (!initialized || library.length === 0 || shelves.length === 0) return;

    const assignedIds = new Set(shelves.flatMap(s => s.bookIds));
    const unassigned = library.filter(b => !assignedIds.has(b.id));

    if (unassigned.length > 0) {
      setShelves(prev => {
        const next = prev.map(s => ({ ...s, bookIds: [...s.bookIds] }));
        
        // Prepend new books to the first shelf (Main Rack)
        const mainRack = next[0];
        unassigned.reverse().forEach(book => {
          if (!mainRack.bookIds.includes(book.id)) {
            mainRack.bookIds.unshift(book.id);
          }
        });
        
        return next;
      });
    }
  }, [library, initialized]);

  // Persist shelves
  useEffect(() => {
    if (initialized && shelves.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shelves));
    }
  }, [shelves, initialized]);

  const updateShelfTitle = useCallback((shelfId: string, title: string) => {
    setShelves(prev => prev.map(s => s.id === shelfId ? { ...s, title } : s));
  }, []);

  const moveBook = useCallback((bookId: string, fromShelfId: string, toShelfId: string) => {
    if (fromShelfId === toShelfId) return;
    setShelves(prev => {
      const next = prev.map(s => ({ ...s, bookIds: [...s.bookIds] }));
      const from = next.find(s => s.id === fromShelfId);
      const to = next.find(s => s.id === toShelfId);
      if (from && to) {
        from.bookIds = from.bookIds.filter(id => id !== bookId);
        if (!to.bookIds.includes(bookId)) {
          to.bookIds.push(bookId);
        }
      }
      return next;
    });
  }, []);

  const reorderBook = useCallback((shelfId: string, fromIndex: number, toIndex: number) => {
    setShelves(prev => {
      const next = prev.map(s => ({ ...s, bookIds: [...s.bookIds] }));
      const shelf = next.find(s => s.id === shelfId);
      if (shelf && fromIndex >= 0 && toIndex >= 0 && fromIndex < shelf.bookIds.length && toIndex < shelf.bookIds.length) {
        const [moved] = shelf.bookIds.splice(fromIndex, 1);
        shelf.bookIds.splice(toIndex, 0, moved);
      }
      return next;
    });
  }, []);

  return { shelves, updateShelfTitle, moveBook, reorderBook };
}
