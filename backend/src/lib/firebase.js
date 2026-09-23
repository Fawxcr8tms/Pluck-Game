import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { config } from '../config.js';

function app() {
  // Uses GOOGLE_APPLICATION_CREDENTIALS locally, or the runtime service account on Cloud Run / Functions.
  return getApps()[0] ?? initializeApp({ storageBucket: config.storageBucket || undefined });
}

export const auth = () => getAuth(app());
export const db = () => getFirestore(app());
export const bucket = () => getStorage(app()).bucket();
