/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, ensureAuth, storage } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, writeBatch, deleteDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { authService } from './authService';

export interface ReadingProgress {
  page: number;
  epubCfi?: string;
  zoom: number | Record<string, number>;
  theme: string;
  scrollRatio: number;
  updatedAt: number;
}

export interface Highlight {
  id: string;
  bookId: string;
  bookTitle: string;
  text: string;
  page?: number;
  createdAt: number;
}

const getUserId = async () => {
  const portableId = authService.getPortableId();
  if (portableId) return portableId;
  const user: any = await ensureAuth();
  return user.uid;
};

export const syncService = {
  async saveProgress(bookId: string, progress: ReadingProgress) {
    const uid = await getUserId();
    const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
    const docRef = doc(db, 'users', uid, 'progress', bookKey);
    
    // Strip undefined values — Firestore rejects them
    const cleanProgress = Object.fromEntries(
      Object.entries(progress).filter(([, v]) => v !== undefined)
    );
    
    try {
      await setDoc(docRef, {
        ...cleanProgress,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (err) {
      console.error('Firestore Save Error:', err);
      return false;
    }
  },

  async loadProgress(bookId: string): Promise<ReadingProgress | null> {
    const uid = await getUserId();
    const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
    const docRef = doc(db, 'users', uid, 'progress', bookKey);
    
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

  async deleteBook(bookId: string) {
    const uid = await getUserId();
    const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', uid, 'progress', bookKey));
      // Note: we don't delete the cover blob from Storage to avoid accidental data loss
      // and because Storage blobs are cheap. Metadata doc is cleaned up.
      await batch.commit();
      return true;
    } catch (err) {
      console.error('Firestore Delete Error:', err);
      return false;
    }
  },

  async saveMetadata(metadata: Record<string, { title: string; author: string; svg?: string; coverSource?: any }>) {
    const uid = await getUserId();
    const docRef = doc(db, 'users', uid, 'library', 'metadata');
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

  async loadMetadata(): Promise<Record<string, { title: string; author: string; svg?: string; coverSource?: any }> | null> {
    const uid = await getUserId();
    const docRef = doc(db, 'users', uid, 'library', 'metadata');
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
  },

  async uploadCoverBlob(filename: string, base64Image: string): Promise<string | null> {
    const uid = await getUserId();
    const bookKey = filename.replace(/[^a-zA-Z0-9]/g, '_');
    const storageRef = ref(storage, `users/${uid}/covers/${bookKey}`);
    try {
      await uploadString(storageRef, base64Image, 'data_url');
      return await getDownloadURL(storageRef);
    } catch (err) {
      console.error('Firebase Storage Upload Error:', err);
      return null;
    }
  },

  async saveGhostText(bookId: string, text: string) {
    const uid = await getUserId();
    const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
    const docRef = doc(db, 'users', uid, 'ghostText', bookKey);
    try {
      await setDoc(docRef, {
        content: text,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (err) {
      console.error('Firestore GhostText Save Error:', err);
      return false;
    }
  },

  async loadGhostText(bookId: string): Promise<string | null> {
    const uid = await getUserId();
    const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
    const docRef = doc(db, 'users', uid, 'ghostText', bookKey);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data().content;
      }
      return null;
    } catch (err) {
      console.error('Firestore GhostText Load Error:', err);
      return null;
    }
  },

  async saveHighlights(highlights: Highlight[]) {
    const uid = await getUserId();
    const docRef = doc(db, 'users', uid, 'highlights', 'all');
    try {
      await setDoc(docRef, {
        items: highlights,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (err) {
      console.error('Firestore Highlights Save Error:', err);
      return false;
    }
  },

  async loadHighlights(): Promise<Highlight[] | null> {
    const uid = await getUserId();
    const docRef = doc(db, 'users', uid, 'highlights', 'all');
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data().items || [];
      }
      return null;
    } catch (err) {
      console.error('Firestore Highlights Load Error:', err);
      return null;
    }
  },

  async saveSettings(settings: Record<string, any>) {
    const uid = await getUserId();
    const docRef = doc(db, 'users', uid, 'settings', 'prefs');
    try {
      await setDoc(docRef, {
        ...settings,
        updatedAt: serverTimestamp()
      }, { merge: true });
      return true;
    } catch (err) {
      console.error('Firestore Settings Save Error:', err);
      return false;
    }
  },

  async loadSettings(): Promise<Record<string, any> | null> {
    const uid = await getUserId();
    const docRef = doc(db, 'users', uid, 'settings', 'prefs');
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (err) {
      console.error('Firestore Settings Load Error:', err);
      return null;
    }
  }
};
