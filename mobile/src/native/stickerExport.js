import { NativeModules, Platform } from 'react-native';

/**
 * Bridge to the native sticker-pack exporters. The JS side is done; the native side isn't in this repo yet.
 * See docs/EXPORT.md for what each platform allows and the native work involved.
 *
 * Expected native module `PluckStickerExport`:
 *   addToWhatsApp({ identifier, name, publisher, trayIconUri, stickers: [{ uri, emojis }] }) -> Promise<void>
 *     Android: exposes the pack through a ContentProvider, then fires com.whatsapp.intent.action.ENABLE_STICKER_PACK
 *     iOS: writes the pack JSON to the pasteboard and opens whatsapp://stickerPack
 *   addToTelegram({ stickers: [{ uri, emojis }] }) -> Promise<void>   (Android: org.telegram.messenger.CREATE_STICKER_PACK)
 *   syncIMessageStickers({ uris }) -> Promise<void>                   (iOS: copy to the App Group the iMessage extension reads)
 */
const Native = NativeModules.PluckStickerExport;

export const WHATSAPP_LIMITS = { min: 3, max: 30 };

export function isNativeExportAvailable() {
  return Boolean(Native);
}

export async function addPackToWhatsApp(stickers, { name = 'Pluck Faves', trayIconUri } = {}) {
  if (!Native) throw new Error('native_missing');
  const usable = stickers.filter((s) => s.localUri && s.whatsappCompatible);
  if (usable.length < WHATSAPP_LIMITS.min) throw new Error('too_few');
  return Native.addToWhatsApp({
    identifier: 'pluck-faves',
    name,
    publisher: 'Pluck',
    trayIconUri: trayIconUri ?? usable[0].localUri,
    stickers: usable.slice(0, WHATSAPP_LIMITS.max).map((s) => ({ uri: s.localUri, emojis: ['😀'] })),
  });
}

export async function syncIMessage(stickers) {
  if (Platform.OS !== 'ios' || !Native) throw new Error('native_missing');
  return Native.syncIMessageStickers({ uris: stickers.map((s) => s.localUri).filter(Boolean) });
}
