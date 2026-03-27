/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Simple KVDB sync service
// Using kvdb.io for cross-device progress sync

const BUCKET_ID = import.meta.env.VITE_KVDB_BUCKET || 'catreader1';

export interface ReadingProgress {
  page: number;
  zoom: number;
  theme: string;
  updatedAt: number;
}

export const syncService = {
  async saveProgress(bookId: string, progress: ReadingProgress) {
    const key = `progress_${bookId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const url = `https://kvdb.io/${BUCKET_ID}/${key}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(progress),
      });
      if (!response.ok) throw new Error('Failed to save to KVDB');
      return true;
    } catch (err) {
      console.error('KVDB Save Error:', err);
      return false;
    }
  },

  async loadProgress(bookId: string): Promise<ReadingProgress | null> {
    const key = `progress_${bookId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const url = `https://kvdb.io/${BUCKET_ID}/${key}`;
    
    try {
      const response = await fetch(url);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Failed to load from KVDB');
      return await response.json();
    } catch (err) {
      console.error('KVDB Load Error:', err);
      return null;
    }
  }
};
