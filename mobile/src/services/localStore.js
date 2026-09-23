import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

const INDEX_KEY = 'pluck:vault:v1';
const dir = new Directory(Paths.document, 'stickers');

function ensureDir() {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

export const localFileFor = (id) => new File(dir, `${id}.webp`);

/** The vault index lives in AsyncStorage so the grid paints instantly, offline, before Firestore answers. */
export async function readIndex() {
  try {
    return JSON.parse((await AsyncStorage.getItem(INDEX_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

export const writeIndex = (stickers) => AsyncStorage.setItem(INDEX_KEY, JSON.stringify(stickers));

/**
 * Make sure a sticker's image is on disk. Sharing, copying and keyboard export all need a local file,
 * and it means the vault still works on a plane.
 */
export async function ensureLocalFile(sticker) {
  ensureDir();
  const file = localFileFor(sticker.id);
  if (file.exists) return file.uri;
  const downloaded = await File.downloadFileAsync(sticker.url, file);
  return downloaded.uri;
}

export function deleteLocalFile(id) {
  const file = localFileFor(id);
  if (file.exists) file.delete();
}
