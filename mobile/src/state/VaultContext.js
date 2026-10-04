import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { deleteSticker, importSticker } from '../services/api';
import { cloudEnabled, db, ensureSignedIn } from '../services/firebase';
import { deleteLocalFiles, ensureLocalFile, readIndex, storeLocalImage, writeIndex } from '../services/localStore';

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

const newId = () => `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Local-first vault.
 *  - Stickers cut out on the phone (`local: true`) live only in the AsyncStorage index + files on disk.
 *    This is the whole app when Firebase isn't configured.
 *  - When cloud sync is on, stickers saved through the backend come from Firestore and are merged in,
 *    with their images downloaded so export works offline.
 */
export function VaultProvider({ children }) {
  const [uid, setUid] = useState(null);
  const [stickers, setStickersState] = useState([]);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const latest = useRef([]);

  // Single writer so the in-memory list and the on-disk index never drift.
  const setStickers = useCallback((updater) => {
    setStickersState((cur) => {
      const next = typeof updater === 'function' ? updater(cur) : updater;
      latest.current = next;
      writeIndex(next);
      return next;
    });
  }, []);

  const downloadMissing = useCallback(
    async (list) => {
      for (const s of list.filter((x) => !x.localUri && x.url)) {
        try {
          const localUri = await ensureLocalFile(s);
          setStickers((cur) => cur.map((x) => (x.id === s.id ? { ...x, localUri } : x)));
        } catch {
          // Try again on the next snapshot.
        }
      }
    },
    [setStickers],
  );

  useEffect(() => {
    readIndex().then((cached) => {
      latest.current = cached;
      setStickersState(cached);
      setReady(true);
    });
    if (cloudEnabled) ensureSignedIn().then((u) => setUid(u?.uid ?? null), (e) => setSyncError(e.message));
  }, []);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'users', uid, 'stickers'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        const prev = new Map(latest.current.map((s) => [s.id, s]));
        const remote = snap.docs.map((d) => ({ ...toPlain(d), localUri: prev.get(d.id)?.localUri ?? null }));
        const remoteIds = new Set(remote.map((s) => s.id));
        for (const s of latest.current) if (!s.local && !remoteIds.has(s.id)) deleteLocalFiles(s.id);
        const next = [...latest.current.filter((s) => s.local), ...remote].sort((a, b) => b.createdAt - a.createdAt);
        setStickers(next);
        setSyncError(null);
        downloadMissing(next);
      },
      (err) => setSyncError(err.message), // stay on the cached index; don't blank the grid
    );
  }, [uid, downloadMissing, setStickers]);

  /** Save a cut-out made on the phone. No network involved. */
  const addLocal = useCallback(
    async ({ uri, sourcePlatform = 'manual', sourceUrl = null, tags = [] }) => {
      const id = newId();
      const localUri = await storeLocalImage(id, uri);
      const now = Date.now();
      const sticker = { id, local: true, localUri, sourcePlatform, sourceUrl, tags, favorite: false, animated: false, whatsappCompatible: true, createdAt: now, updatedAt: now };
      setStickers((cur) => [sticker, ...cur]);
      return sticker;
    },
    [setStickers],
  );

  /** Save a candidate found by the backend scraper (needs cloud sync). */
  const save = useCallback(async (payload) => {
    if (!cloudEnabled) throw new Error('Saving from links needs cloud sync. Cut stickers out of screenshots instead.');
    return importSticker(payload); // the snapshot listener adds it to the grid
  }, []);

  const patchLocal = useCallback(
    (id, patch) => setStickers((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s))),
    [setStickers],
  );

  const updateTags = useCallback(
    (id, tags) => {
      const s = latest.current.find((x) => x.id === id);
      if (!s || s.local) return patchLocal(id, { tags });
      return updateDoc(doc(db, 'users', uid, 'stickers', id), { tags, updatedAt: serverTimestamp() });
    },
    [uid, patchLocal],
  );

  const toggleFavorite = useCallback(
    (s) => {
      if (s.local) return patchLocal(s.id, { favorite: !s.favorite });
      return updateDoc(doc(db, 'users', uid, 'stickers', s.id), { favorite: !s.favorite, updatedAt: serverTimestamp() });
    },
    [uid, patchLocal],
  );

  const remove = useCallback(
    async (id) => {
      const s = latest.current.find((x) => x.id === id);
      if (s && !s.local) await deleteSticker(id); // backend deletes the Storage files too
      deleteLocalFiles(id);
      setStickers((cur) => cur.filter((x) => x.id !== id));
    },
    [setStickers],
  );

  const value = useMemo(
    () => ({ ready, uid, cloudEnabled, stickers, syncError, addLocal, save, updateTags, toggleFavorite, remove, ensureLocalFile }),
    [ready, uid, stickers, syncError, addLocal, save, updateTags, toggleFavorite, remove],
  );
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside <VaultProvider>');
  return ctx;
}
