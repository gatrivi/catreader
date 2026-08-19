import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

const AUTH_TIMEOUT_MS = 8000;
let authPromise: Promise<User> | null = null;

/**
 * Return a real Firebase user or reject. Never fabricate a guest uid: a fake
 * uid makes Firestore requests run without a matching authenticated identity
 * and turns one auth/network failure into a cascade of sync errors.
 */
export const ensureAuth = (): Promise<User> => {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (authPromise) return authPromise;

  authPromise = new Promise<User>((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    let timeout: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timeout);
      unsubscribe?.();
    };

    const succeed = (user: User) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(user);
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    timeout = setTimeout(() => {
      fail(new Error('Firebase auth unavailable'));
    }, AUTH_TIMEOUT_MS);

    unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (user) {
          succeed(user);
          return;
        }

        try {
          const cred = await signInAnonymously(auth);
          succeed(cred.user);
        } catch (error) {
          fail(error);
        }
      },
      fail,
    );
  }).finally(() => {
    authPromise = null;
  });

  return authPromise;
};
