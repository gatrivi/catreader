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
    const migrationKey = 'catreader_migration_v2.7.5';
    const hasMigrated = localStorage.getItem(migrationKey);

    if (stored) {
      try {
        let parsed = JSON.parse(stored);
        
        // One-time migration for Gaston's request
        if (!hasMigrated && Array.isArray(parsed)) {
          console.log('[Migration] Applying Gaston reorganization...');
          const allBooks = parsed.flatMap((s: Shelf) => s.bookIds);
          parsed = parsed.map((s: Shelf, i: number) => ({
            ...s,
            title: i === 0 ? 'Church' : i === 1 ? 'Meditation' : i === 2 ? 'Other' : s.title,
            bookIds: [] as string[]
          }));
          
          allBooks.forEach((id, idx) => {
             const shelfIdx = Math.min(Math.floor(idx / 16), 2);
             if (parsed[shelfIdx]) parsed[shelfIdx].bookIds.push(id);
          });
          
          localStorage.setItem(migrationKey, 'true');
          setShelves(parsed);
          setInitialized(true);
          return;
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          setShelves(parsed);
          setInitialized(true);
          return;
        }
      } catch (e) {
        console.error('Failed to parse shelves:', e);
      }
    }

    // Create default shelves
    const defaultShelves: Shelf[] = Array.from({ length: 8 }, (_, i) => ({
      id: `shelf-${i}`,
      title: i === 0 ? 'Church' : i === 1 ? 'Meditation' : i === 2 ? 'Other' : `Shelf ${i + 1}`,
      bookIds: []
    }));
    setShelves(defaultShelves);
    setInitialized(true);
  }, []);

  // Auto-distribute unassigned books when library or shelves change
  useEffect(() => {
    if (!initialized || library.length === 0 || shelves.length === 0) return;

    const libraryIds = new Set(library.map(b => b.id));
    const assignedIds = new Set(shelves.flatMap(s => s.bookIds));
    const unassigned = library.filter(b => !assignedIds.has(b.id));
    const hasStale = shelves.some(s => s.bookIds.some(id => !libraryIds.has(id)));

    if (unassigned.length > 0 || hasStale) {
      setShelves(prev => {
        const next = prev.map(s => ({
          ...s,
          bookIds: s.bookIds.filter(id => libraryIds.has(id))
        }));
        
        // Append new books to the emptiest shelves to avoid shifting existing books
        unassigned.forEach(book => {
          const emptiest = next.reduce((a, b) =>
            a.bookIds.length <= b.bookIds.length ? a : b
          );
          if (!emptiest.bookIds.includes(book.id)) {
            emptiest.bookIds.push(book.id);
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
      if (shelf) {
        // Handle moving to an empty slot beyond current length
        const targetIndex = Math.min(toIndex, 15);
        const [moved] = shelf.bookIds.splice(fromIndex, 1);
        
        // If targetIndex is beyond current length, just push
        if (targetIndex >= shelf.bookIds.length) {
          shelf.bookIds.push(moved);
        } else {
          shelf.bookIds.splice(targetIndex, 0, moved);
        }
      }
      return next;
    });
  }, []);

  const addShelf = useCallback(() => {
    setShelves(prev => [
      ...prev,
      { id: `shelf-${Date.now()}`, title: `Shelf ${prev.length + 1}`, bookIds: [] }
    ]);
  }, []);

  const removeShelf = useCallback((shelfId: string) => {
    setShelves(prev => {
      const target = prev.find(s => s.id === shelfId);
      if (!target) return prev;
      if (target.bookIds.length > 0) {
        // Move books to the first shelf
        const next = prev.map(s => ({ ...s, bookIds: [...s.bookIds] }));
        const first = next.find(s => s.id === prev[0].id);
        if (first) {
          target.bookIds.forEach(id => {
            if (!first.bookIds.includes(id)) first.bookIds.push(id);
          });
        }
        return next.filter(s => s.id !== shelfId);
      }
      return prev.filter(s => s.id !== shelfId);
    });
  }, []);

  const consolidateShelves = useCallback(() => {
    setShelves(prev => {
      const allBooks = prev.flatMap(s => s.bookIds);
      const next = prev.map((s, i) => ({ 
        ...s, 
        title: i === 0 ? 'Church' : i === 1 ? 'Meditation' : i === 2 ? 'Other' : s.title,
        bookIds: [] as string[] 
      }));
      
      allBooks.forEach((bookId, idx) => {
        // Pack into first 3 racks if possible (up to 16 per rack)
        const shelfIdx = Math.min(Math.floor(idx / 16), 2);
        if (next[shelfIdx]) {
          next[shelfIdx].bookIds.push(bookId);
        }
      });
      
      return next;
    });
  }, []);

  return { shelves, updateShelfTitle, moveBook, reorderBook, consolidateShelves, addShelf, removeShelf };
}
