import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

const INDEX_KEY = 'pluck:vault:v1';
const dir = new Directory(Paths.document, 'stickers');

function ensureDir() {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

const fileFor = (id, ext) => new File(dir, `${id}.${ext}`);

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
 * Make sure a sticker's image is on disk. Sharing, copying and WhatsApp export all need a local file,
 * and it means the vault still works on a plane.
 */
export async function ensureLocalFile(sticker) {
  if (sticker.localUri && new File(sticker.localUri).exists) return sticker.localUri;
  ensureDir();
  const file = fileFor(sticker.id, 'webp');
  if (file.exists) return file.uri;
  const downloaded = await File.downloadFileAsync(sticker.url, file);
  return downloaded.uri;
}

/** Copy a cut-out (temp PNG) into the vault folder. Returns the permanent file URI. */
export async function storeLocalImage(id, srcUri) {
  ensureDir();
  const dest = fileFor(id, 'png');
  if (dest.exists) dest.delete();
  await new File(srcUri).copy(dest);
  return dest.uri;
}

/** Write a base64 image (from the clipboard) to a temp file so it can go through the cut-out screen. */
export function writeTempImage(base64) {
  const file = new File(Paths.cache, `paste-${Date.now()}.png`);
  file.write(base64.replace(/^data:[^,]+,/, ''), { encoding: 'base64' });
  return file.uri;
}

export function deleteLocalFiles(id) {
  for (const ext of ['webp', 'png']) {
    const f = fileFor(id, ext);
    if (f.exists) f.delete();
  }
}
