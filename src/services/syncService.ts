/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, ensureAuth, storage } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

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

export interface BookMetadata {
  title: string;
  author: string;
  svg?: string;
  coverSource?: any;
}

type CloudState = 'unknown' | 'online' | 'offline';

const CLOUD_RETRY_MS = 30_000;
const CLOUD_OPERATION_TIMEOUT_MS = 5_000;
let cloudState: CloudState = 'unknown';
let cloudOfflineUntil = 0;
let cloudGate: Promise<void> | null = null;
let offlineWarningShown = false;

const browserIsOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const cloudLooksUnavailable = (error: unknown) => {
  const code = String((error as any)?.code || '').toLowerCase();
  const message = errorMessage(error).toLowerCase();

  return browserIsOffline()
    || code.includes('network-request-failed')
    || code.includes('unavailable')
    || code.includes('deadline-exceeded')
    || message.includes('client is offline')
    || message.includes('failed to fetch')
    || message.includes('network error')
    || message.includes('firebase auth unavailable')
    || message.includes('cloud operation timed out');
};

const refreshCloudState = () => {
  if (cloudState === 'offline' && Date.now() >= cloudOfflineUntil) {
    cloudState = 'unknown';
    cloudOfflineUntil = 0;
  }
};

const markCloudOnline = () => {
  cloudState = 'online';
  cloudOfflineUntil = 0;
  offlineWarningShown = false;
};

const markCloudOffline = (operation: string, error: unknown) => {
  cloudState = 'offline';
  cloudOfflineUntil = Date.now() + CLOUD_RETRY_MS;

  if (!offlineWarningShown) {
    offlineWarningShown = true;
    console.warn('[CatReader:sync] Cloud unavailable; continuing local-first.', {
      operation,
      error: errorMessage(error),
    });
  }
};

const withTimeout = async <T>(operation: Promise<T>): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Cloud operation timed out')),
          CLOUD_OPERATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout!);
  }
};

/**
 * Serialize only the first cloud attempt. If Firebase is unreachable, one
 * failure opens a short circuit breaker so startup does not fan out into
 * settings/highlights/metadata/progress/ghost-text errors.
 */
const runCloud = async <T>(
  operationName: string,
  fallback: T,
  operation: () => Promise<T>,
): Promise<T> => {
  refreshCloudState();

  if (browserIsOffline()) {
    markCloudOffline(operationName, new Error('Browser is offline'));
    return fallback;
  }

  if (cloudState === 'offline') return fallback;

  if (cloudState === 'unknown' && cloudGate) {
    await cloudGate;
    return runCloud(operationName, fallback, operation);
  }

  if (cloudState === 'unknown') {
    let releaseGate!: () => void;
    cloudGate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    try {
      const result = await withTimeout(operation());
      markCloudOnline();
      return result;
    } catch (error) {
      if (cloudLooksUnavailable(error)) {
        markCloudOffline(operationName, error);
      } else {
        // The transport is reachable; do not punish unrelated cloud calls.
        markCloudOnline();
        console.error(`[CatReader:sync] ${operationName} failed:`, error);
      }
      return fallback;
    } finally {
      releaseGate();
      cloudGate = null;
    }
  }

  try {
    return await withTimeout(operation());
  } catch (error) {
    if (cloudLooksUnavailable(error)) {
      markCloudOffline(operationName, error);
    } else {
      console.error(`[CatReader:sync] ${operationName} failed:`, error);
    }
    return fallback;
  }
};

/** Firestore rules are keyed to the actual authenticated Firebase uid. */
const getUserId = async () => {
  const user = await ensureAuth();
  return user.uid;
};

export const syncService = {
  async saveProgress(bookId: string, progress: ReadingProgress) {
    return runCloud('progress save', false, async () => {
      const uid = await getUserId();
      const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
      const docRef = doc(db, 'users', uid, 'progress', bookKey);

      // Strip undefined values — Firestore rejects them.
      const cleanProgress = Object.fromEntries(
        Object.entries(progress).filter(([, value]) => value !== undefined),
      );

      await setDoc(docRef, {
        ...cleanProgress,
        updatedAt: serverTimestamp(),
      });
      return true;
    });
  },

  async loadProgress(bookId: string): Promise<ReadingProgress | null> {
    return runCloud('progress load', null, async () => {
      const uid = await getUserId();
      const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
      const docRef = doc(db, 'users', uid, 'progress', bookKey);
      const snap = await getDoc(docRef);

      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        ...data,
        updatedAt: data.updatedAt?.toMillis() || Date.now(),
      } as ReadingProgress;
    });
  },

  async deleteBook(bookId: string) {
    return runCloud('book delete', false, async () => {
      const uid = await getUserId();
      const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', uid, 'progress', bookKey));
      // Cover blobs stay in Storage to avoid accidental data loss.
      await batch.commit();
      return true;
    });
  },

  async saveMetadata(metadata: Record<string, BookMetadata>) {
    return runCloud('metadata save', false, async () => {
      const uid = await getUserId();
      const docRef = doc(db, 'users', uid, 'library', 'metadata');
      await setDoc(docRef, {
        books: metadata,
        updatedAt: serverTimestamp(),
      });
      return true;
    });
  },

  /**
   * Register or update one book without replacing the rest of the cloud library.
   * This is the safe primitive for freshly imported local files.
   */
  async upsertMetadata(filename: string, metadata: BookMetadata) {
    return runCloud('metadata upsert', false, async () => {
      const uid = await getUserId();
      const docRef = doc(db, 'users', uid, 'library', 'metadata');
      const snap = await getDoc(docRef);
      const books = snap.exists() ? (snap.data().books || {}) : {};

      await setDoc(docRef, {
        books: {
          ...books,
          [filename]: metadata,
        },
        updatedAt: serverTimestamp(),
      });
      return true;
    });
  },

  async loadMetadata(): Promise<Record<string, BookMetadata> | null> {
    return runCloud('metadata load', null, async () => {
      const uid = await getUserId();
      const docRef = doc(db, 'users', uid, 'library', 'metadata');
      const snap = await getDoc(docRef);
      return snap.exists() ? snap.data().books : null;
    });
  },

  async uploadCoverBlob(filename: string, base64Image: string): Promise<string | null> {
    return runCloud('cover upload', null, async () => {
      const uid = await getUserId();
      const bookKey = filename.replace(/[^a-zA-Z0-9]/g, '_');
      const storageRef = ref(storage, `users/${uid}/covers/${bookKey}`);
      await uploadString(storageRef, base64Image, 'data_url');
      return getDownloadURL(storageRef);
    });
  },

  async saveGhostText(bookId: string, text: string) {
    return runCloud('ghost text save', false, async () => {
      const uid = await getUserId();
      const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
      const docRef = doc(db, 'users', uid, 'ghostText', bookKey);
      await setDoc(docRef, {
        content: text,
        updatedAt: serverTimestamp(),
      });
      return true;
    });
  },

  async loadGhostText(bookId: string): Promise<string | null> {
    return runCloud('ghost text load', null, async () => {
      const uid = await getUserId();
      const bookKey = bookId.replace(/[^a-zA-Z0-9]/g, '_');
      const docRef = doc(db, 'users', uid, 'ghostText', bookKey);
      const snap = await getDoc(docRef);
      return snap.exists() ? snap.data().content : null;
    });
  },

  async saveHighlights(highlights: Highlight[]) {
    return runCloud('highlights save', false, async () => {
      const uid = await getUserId();
      const docRef = doc(db, 'users', uid, 'highlights', 'all');
      await setDoc(docRef, {
        items: highlights,
        updatedAt: serverTimestamp(),
      });
      return true;
    });
  },

  async loadHighlights(): Promise<Highlight[] | null> {
    return runCloud('highlights load', null, async () => {
      const uid = await getUserId();
      const docRef = doc(db, 'users', uid, 'highlights', 'all');
      const snap = await getDoc(docRef);
      return snap.exists() ? (snap.data().items || []) : null;
    });
  },

  async saveSettings(settings: Record<string, any>) {
    return runCloud('settings save', false, async () => {
      const uid = await getUserId();
      const docRef = doc(db, 'users', uid, 'settings', 'prefs');
      await setDoc(docRef, {
        ...settings,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      return true;
    });
  },

  async loadSettings(): Promise<Record<string, any> | null> {
    return runCloud('settings load', null, async () => {
      const uid = await getUserId();
      const docRef = doc(db, 'users', uid, 'settings', 'prefs');
      const snap = await getDoc(docRef);
      return snap.exists() ? snap.data() : null;
    });
  },
};
