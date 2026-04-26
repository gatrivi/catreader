import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Anonymous Auth for "No Login Hell"
export const ensureAuth = () => {
  return new Promise((resolve, reject) => {
    // Timeout after 5 seconds to avoid hanging the app
    const timeout = setTimeout(() => {
      console.warn('Auth timeout reached, proceeding as guest');
      resolve({ uid: 'guest_' + Math.random().toString(36).substring(7) });
    }, 5000);

    onAuthStateChanged(auth, async (user) => {
      clearTimeout(timeout);
      if (user) {
        resolve(user);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          resolve(cred.user);
        } catch (err) {
          console.error('Anonymous sign-in failed:', err);
          resolve({ uid: 'guest_fallback' });
        }
      }
    });
  });
};
