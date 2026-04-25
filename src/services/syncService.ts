/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Firestore sync service
import { db, ensureAuth } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export interface ReadingProgress {
  page: number;
  zoom: number | Record<string, number>;
  theme: string;
  scrollRatio: number;
  updatedAt: number;
}

export const syncService = {
  async saveProgress(bookId: string, progress: ReadingProgress) {
    const user: any = await ensureAuth();
    const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
    const docRef = doc(db, 'users', user.uid, 'progress', bookKey);
    
    try {
      await setDoc(docRef, {
        ...progress,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (err) {
      console.error('Firestore Save Error:', err);
      return false;
    }
  },

  async loadProgress(bookId: string): Promise<ReadingProgress | null> {
    const user: any = await ensureAuth();
    const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
    const docRef = doc(db, 'users', user.uid, 'progress', bookKey);
    
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          ...data,
          updatedAt: data.updatedAt?.toMillis() || Date.now()
        } as ReadingProgress;
      }
      return null;
    } catch (err) {
      console.error('Firestore Load Error:', err);
      return null;
    }
  },

  async saveMetadata(metadata: Record<string, { title: string; author: string }>) {
    const user: any = await ensureAuth();
    const docRef = doc(db, 'users', user.uid, 'library', 'metadata');
    try {
      await setDoc(docRef, {
        books: metadata,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (err) {
      console.error('Firestore Metadata Save Error:', err);
      return false;
    }
  },

  async loadMetadata(): Promise<Record<string, { title: string; author: string }> | null> {
    const user: any = await ensureAuth();
    const docRef = doc(db, 'users', user.uid, 'library', 'metadata');
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data().books;
      }
      return null;
    } catch (err) {
      console.error('Firestore Metadata Load Error:', err);
      return null;
    }
  }
};
