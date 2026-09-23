import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { deleteSticker, importSticker } from '../services/api';
import { db, ensureSignedIn } from '../services/firebase';
import { deleteLocalFile, ensureLocalFile, readIndex, writeIndex } from '../services/localStore';

const VaultContext = createContext(null);

const toPlain = (snap) => {
  const d = snap.data();
  return {
    id: snap.id,
    ...d,
    createdAt: d.createdAt?.toMillis?.() ?? Date.now(),
    updatedAt: d.updatedAt?.toMillis?.() ?? Date.now(),
  };
};

/**
 * Local-first vault:
 *   1. paint from the AsyncStorage index immediately
 *   2. subscribe to users/{uid}/stickers and reconcile
 *   3. download image files in the background so export works offline
 */
export function VaultProvider({ children }) {
  const [uid, setUid] = useState(null);
  const [stickers, setStickers] = useState([]);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const downloadMissing = useCallback(async (list) => {
    for (const s of list.filter((x) => !x.localUri)) {
      try {
        const localUri = await ensureLocalFile(s);
        setStickers((cur) => {
          const updated = cur.map((x) => (x.id === s.id ? { ...x, localUri } : x));
          writeIndex(updated);
          return updated;
        });
      } catch {
        // Try again on the next snapshot.
      }
    }
  }, []);

  useEffect(() => {
    readIndex().then((cached) => {
      setStickers((cur) => (cur.length ? cur : cached));
      setReady(true);
    });
    ensureSignedIn().then((u) => setUid(u.uid), (e) => setSyncError(e.message));
  }, []);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'users', uid, 'stickers'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      async (snap) => {
        const cached = new Map((await readIndex()).map((s) => [s.id, s]));
        const next = snap.docs.map((d) => ({ ...toPlain(d), localUri: cached.get(d.id)?.localUri ?? null }));
        setStickers(next);
        setSyncError(null);
        writeIndex(next);
        for (const gone of cached.keys()) if (!snap.docs.some((d) => d.id === gone)) deleteLocalFile(gone);
        downloadMissing(next);
      },
      (err) => setSyncError(err.message), // stay on the cached index; don't blank the grid
    );
  }, [uid, downloadMissing]);

  const save = useCallback(async (payload) => {
    const { sticker, duplicate } = await importSticker(payload);
    return { sticker, duplicate }; // the snapshot listener adds it to the grid
  }, []);

  const updateTags = useCallback(
    (id, tags) => updateDoc(doc(db, 'users', uid, 'stickers', id), { tags, updatedAt: serverTimestamp() }),
    [uid],
  );

  const toggleFavorite = useCallback(
    (s) => updateDoc(doc(db, 'users', uid, 'stickers', s.id), { favorite: !s.favorite, updatedAt: serverTimestamp() }),
    [uid],
  );

  // Goes through the backend so the Storage files are deleted too.
  const remove = useCallback((id) => deleteSticker(id), []);

  const value = useMemo(
    () => ({ ready, uid, stickers, syncError, save, updateTags, toggleFavorite, remove, ensureLocalFile }),
    [ready, uid, stickers, syncError, save, updateTags, toggleFavorite, remove],
  );
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside <VaultProvider>');
  return ctx;
}
