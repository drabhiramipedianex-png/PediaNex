import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_KID_FIREBASE_API_KEY || 'AIzaSyAm-cUFMyTFSyw8KlFOCcBKQkTKApEr5oo',
  authDomain: import.meta.env.VITE_KID_FIREBASE_AUTH_DOMAIN || 'clinci-dr-gunda.firebaseapp.com',
  projectId: import.meta.env.VITE_KID_FIREBASE_PROJECT_ID || 'clinci-dr-gunda',
  storageBucket: import.meta.env.VITE_KID_FIREBASE_STORAGE_BUCKET || 'clinci-dr-gunda.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_KID_FIREBASE_MESSAGING_SENDER_ID || '1059959825609',
  appId: import.meta.env.VITE_KID_FIREBASE_APP_ID || '1:1059959825609:web:8201599754706ac4661918',
  measurementId: import.meta.env.VITE_KID_FIREBASE_MEASUREMENT_ID || 'G-4V5JMVW45E'
};

const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
const firebaseConfigured = !isFileProtocol && Object.values(firebaseConfig).every(Boolean);
export const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;

export const db = app
  ? initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  })
  : null;

export const storage = app ? getStorage(app) : null;

export const auth = app ? getAuth(app) : null;

// Firestore rules can only check request.auth, so the browser needs a real
// Firebase identity. The token is minted server-side by /api/kid/auth/login
// only after the clinic password is verified, then persisted by the Auth SDK,
// so later page loads restore it without another round trip.
//
// This module awaits that restoration at the top level, which means every page
// importing `db` is already signed in before its first query. Without it there
// is a race on first paint where a query goes out unauthenticated.
export const authReady = auth
  ? new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        console.warn(`Firebase auth restore failed: ${error.message}`);
        unsubscribe();
        resolve(null);
      }
    );
  })
  : Promise.resolve(null);

export async function signInWithClinicToken(customToken) {
  if (!auth || !customToken) {
    return null;
  }

  const credential = await signInWithCustomToken(auth, customToken);
  return credential.user;
}

export async function signOutClinic() {
  if (!auth) {
    return;
  }

  try {
    await signOut(auth);
  } catch (error) {
    console.warn(`Firebase sign-out failed: ${error.message}`);
  }
}

// Resolves to the restored user or null - never rejects, so a signed-out
// visitor still gets a rendered page rather than a blank one.
await authReady;
