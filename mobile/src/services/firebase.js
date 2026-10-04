import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps } from 'firebase/app';
import { getReactNativePersistence, initializeAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '../config';

/** Cloud sync is optional: without Firebase config the vault runs entirely on the phone. */
export const cloudEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = cloudEnabled ? getApps()[0] ?? initializeApp(firebaseConfig) : null;
export const auth = app ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) }) : null;
export const db = app ? getFirestore(app) : null;

/**
 * Start anonymous so the vault works on first launch with zero friction.
 * Later, link a real provider (linkWithCredential) so the vault survives a reinstall.
 */
export function ensureSignedIn() {
  if (!auth) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (user) resolve(user);
      else signInAnonymously(auth).then((c) => resolve(c.user), reject);
    });
  });
}
