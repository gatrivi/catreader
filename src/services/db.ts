/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  notifyContentCacheChanged,
  readContentCacheIndex,
  writeContentCacheIndex,
  type ContentCacheEntry,
} from '../utils/contentCacheIndex';
import { getPinnedBookFilenames } from '../utils/pinnedBooks';

export const coverDB = {
  dbName: 'CatReaderDB',
  storeName: 'covers',
  contentStore: 'content',
  coverThumbStore: 'coverThumbs',
  ghostStore: 'ghostText',
  highlightsStore: 'highlights',
  metadataStore: 'bookMetadata',
  ttsAudioStore: 'ttsAudio',

  async init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 7); // v7: coverThumbs (offline library covers)
      request.onupgradeneeded = (e: any) => {
        const db = request.result;
        const oldVersion = e.oldVersion || 0;

        // Cumulative fall-through version upgrade pipeline (no break statements)
        switch (true) {
          case oldVersion < 1:
            if (!db.objectStoreNames.contains(this.storeName)) {
              db.createObjectStore(this.storeName);
            }
            if (!db.objectStoreNames.contains(this.contentStore)) {
              db.createObjectStore(this.contentStore);
            }
            // fall through
          case oldVersion < 2:
            if (!db.objectStoreNames.contains(this.ghostStore)) {
              db.createObjectStore(this.ghostStore);
            }
            // fall through
          case oldVersion < 4:
            if (!db.objectStoreNames.contains(this.highlightsStore)) {
              db.createObjectStore(this.highlightsStore);
            }
            // fall through
          case oldVersion < 5:
            if (!db.objectStoreNames.contains(this.metadataStore)) {
              db.createObjectStore(this.metadataStore);
            }
            // fall through
          case oldVersion < 6:
            if (!db.objectStoreNames.contains(this.ttsAudioStore)) {
              db.createObjectStore(this.ttsAudioStore);
            }
            // fall through
          case oldVersion < 7:
            if (!db.objectStoreNames.contains(this.coverThumbStore)) {
              db.createObjectStore(this.coverThumbStore);
            }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async saveCover(filename: string, base64: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(base64, filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  
  async getCover(filename: string): Promise<string | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const request = tx.objectStore(this.storeName).get(filename);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  async saveBookContent(filename: string, blob: Blob): Promise<void> {
    const db = await this.init();
    // Budget-bounded LRU so perusing many books no longer evicts the whole
    // cache on every open. Pinned books ("keep on device") are never evicted.
    const MAX_BYTES = 400 * 1024 * 1024;
    const MAX_ENTRIES = 40;
    const list: ContentCacheEntry[] = readContentCacheIndex();

    // Remove if already exists to move to end
    const existing = list.findIndex((e) => e.f === filename);
    if (existing >= 0) list.splice(existing, 1);
    list.push({ f: filename, s: blob.size });

    // Prune oldest unpinned until under budget (never below 4 entries)
    const pinned = new Set(getPinnedBookFilenames());
    let total = list.reduce((acc, e) => acc + e.s, 0);
    const evicted: string[] = [];
    while ((total > MAX_BYTES || list.length > MAX_ENTRIES) && list.length > 4) {
      const victim = list.findIndex((e) => !pinned.has(e.f));
      if (victim === -1) break; // everything left is pinned — keep over budget
      const [evictedEntry] = list.splice(victim, 1);
      total -= evictedEntry.s;
      evicted.push(evictedEntry.f);
    }

    writeContentCacheIndex(list);

    if (evicted.length) {
      const tx = db.transaction(this.contentStore, 'readwrite');
      const store = tx.objectStore(this.contentStore);
      for (const f of evicted) store.delete(f);
    }

    notifyContentCacheChanged();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.contentStore, 'readwrite');
      tx.objectStore(this.contentStore).put(blob, filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getBookContent(filename: string): Promise<Blob | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.contentStore, 'readonly');
      const request = tx.objectStore(this.contentStore).get(filename);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  /** Display-quality cover thumbnail (small data URL) so the shelf never touches the network. */
  async saveCoverThumb(filename: string, dataUrl: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.coverThumbStore, 'readwrite');
      tx.objectStore(this.coverThumbStore).put(dataUrl, filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getCoverThumb(filename: string): Promise<string | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.coverThumbStore, 'readonly');
      const request = tx.objectStore(this.coverThumbStore).get(filename);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteCoverThumb(filename: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.coverThumbStore, 'readwrite');
      tx.objectStore(this.coverThumbStore).delete(filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async saveGhostText(filename: string, text: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.ghostStore, 'readwrite');
      tx.objectStore(this.ghostStore).put(text, filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getGhostText(filename: string): Promise<string | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.ghostStore, 'readonly');
      const request = tx.objectStore(this.ghostStore).get(filename);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  async saveHighlights(highlights: Highlight[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.highlightsStore, 'readwrite');
      tx.objectStore(this.highlightsStore).put(highlights, 'all');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getHighlights(): Promise<Highlight[] | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.highlightsStore, 'readonly');
      const request = tx.objectStore(this.highlightsStore).get('all');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  async saveBookMetadata(filename: string, meta: { title: string; author: string; svg?: string }): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.metadataStore, 'readwrite');
      tx.objectStore(this.metadataStore).put(meta, filename);
      tx.oncomplete = () => {
        resolve();

        // App.tsx uses this exact foundational stamp for newly imported files.
        // Publish it immediately so another device can discover the book even
        // when Gemini enrichment never runs (or the user walks away first).
        if (meta.author === 'Desconocido' && meta.svg === '') {
          void import('./syncService')
            .then(({ syncService }) => syncService.upsertMetadata(filename, meta))
            .then((saved) => {
              if (!saved) console.warn('[Upload] Foundational metadata stayed local:', filename);
            })
            .catch((error) => {
              console.warn('[Upload] Foundational metadata cloud sync failed:', filename, error);
            });
        }
      };
      tx.onerror = () => reject(tx.error);
    });
  },

  async getBookMetadata(filename: string): Promise<{ title: string; author: string; svg?: string } | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.metadataStore, 'readonly');
      const request = tx.objectStore(this.metadataStore).get(filename);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  async getAllBookMetadata(): Promise<Record<string, { title: string; author: string; svg?: string }>> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.metadataStore, 'readonly');
      const store = tx.objectStore(this.metadataStore);
      const request = store.openCursor();
      const result: Record<string, any> = {};
      request.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          result[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async deleteCover(filename: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteBookContent(filename: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.contentStore, 'readwrite');
      tx.objectStore(this.contentStore).delete(filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteGhostText(filename: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.ghostStore, 'readwrite');
      tx.objectStore(this.ghostStore).delete(filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteBookMetadata(filename: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.metadataStore, 'readwrite');
      tx.objectStore(this.metadataStore).delete(filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteBook(filename: string): Promise<void> {
    await Promise.all([
      this.deleteCover(filename).catch(() => {}),
      this.deleteCoverThumb(filename).catch(() => {}),
      this.deleteBookContent(filename).catch(() => {}),
      this.deleteGhostText(filename).catch(() => {}),
      this.deleteBookMetadata(filename).catch(() => {})
    ]);
  },

  /** Cache TTS wav by stable key (lang:hash). */
  async saveTtsAudio(key: string, blob: Blob): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.ttsAudioStore, 'readwrite');
      tx.objectStore(this.ttsAudioStore).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getTtsAudio(key: string): Promise<Blob | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.ttsAudioStore, 'readonly');
      const request = tx.objectStore(this.ttsAudioStore).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },
};

export interface Highlight {
  id: string;
  bookId: string;
  bookTitle: string;
  text: string;
  page?: number;
  createdAt: number;
}
