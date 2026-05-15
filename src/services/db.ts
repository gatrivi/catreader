/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const coverDB = {
  dbName: 'CatReaderDB',
  storeName: 'covers',
  contentStore: 'content',
  ghostStore: 'ghostText',
  highlightsStore: 'highlights',
  
  async init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 4); // Bumped version for highlights store
      request.onupgradeneeded = (e: any) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
        if (!db.objectStoreNames.contains(this.contentStore)) {
          db.createObjectStore(this.contentStore);
        }
        if (!db.objectStoreNames.contains(this.ghostStore)) {
          db.createObjectStore(this.ghostStore);
        }
        if (!db.objectStoreNames.contains(this.highlightsStore)) {
          db.createObjectStore(this.highlightsStore);
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
    // Maintain LRU in localStorage
    const cacheKey = 'catreader_content_cache_list';
    let cacheList: string[] = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    
    // Remove if already exists to move to end
    cacheList = cacheList.filter(f => f !== filename);
    cacheList.push(filename);

    // Prune if more than 4
    if (cacheList.length > 4) {
      const toRemove = cacheList.shift();
      if (toRemove) {
        const tx = db.transaction(this.contentStore, 'readwrite');
        tx.objectStore(this.contentStore).delete(toRemove);
      }
    }

    localStorage.setItem(cacheKey, JSON.stringify(cacheList));

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
  }
};

export interface Highlight {
  id: string;
  bookId: string;
  bookTitle: string;
  text: string;
  page?: number;
  createdAt: number;
}
