import PluckNative from '../../modules/pluck-native';

export const WHATSAPP_LIMITS = { min: 3, max: 30 };
const PUBLISHER = 'Pluck';

/** True in a real iPhone build; false in Expo Go, Android (not built yet) and web. */
export const nativeAvailable = Boolean(PluckNative);

export async function liftSubject(uri, x, y) {
  if (!PluckNative) throw new Error('native_missing');
  return PluckNative.liftSubject(uri, x, y);
}

/**
 * Stickers are grouped into WhatsApp packs of up to 30, oldest first, so a sticker always stays in
 * the same pack: "Pluck 1", "Pluck 2", ... Re-sending a pack with the same identifier updates it.
 */
export function buildPacks(stickers) {
  const usable = stickers.filter((s) => s.whatsappCompatible !== false).sort((a, b) => a.createdAt - b.createdAt);
  const packs = [];
  for (let i = 0; i < usable.length; i += WHATSAPP_LIMITS.max) {
    const n = packs.length + 1;
    packs.push({ identifier: `pluck-${n}`, name: `Pluck ${n}`, stickers: usable.slice(i, i + WHATSAPP_LIMITS.max) });
  }
  return packs;
}

export function packFor(stickers, stickerId) {
  const packs = buildPacks(stickers);
  return packs.find((p) => p.stickers.some((s) => s.id === stickerId)) ?? packs[packs.length - 1] ?? null;
}

/** The pack that new stickers land in, and how many more it needs before WhatsApp will take it. */
export function currentPack(stickers) {
  const packs = buildPacks(stickers);
  const pack = packs[packs.length - 1] ?? { identifier: 'pluck-1', name: 'Pluck 1', stickers: [] };
  return { ...pack, missing: Math.max(0, WHATSAPP_LIMITS.min - pack.stickers.length) };
}

/** Hands the pack to WhatsApp. WhatsApp opens and asks the user to confirm "Add to WhatsApp". */
export async function sendPackToWhatsApp(pack, ensureLocalFile) {
  if (!PluckNative) throw new Error('native_missing');
  if (pack.stickers.length < WHATSAPP_LIMITS.min) throw new Error('too_few');
  const uris = await Promise.all(pack.stickers.map(ensureLocalFile));
  return PluckNative.sendToWhatsApp(pack.identifier, pack.name, PUBLISHER, uris);
}

export function whatsappErrorMessage(e, pack) {
  if (e.message === 'too_few') {
    const n = WHATSAPP_LIMITS.min - (pack?.stickers.length ?? 0);
    return `WhatsApp only takes packs of ${WHATSAPP_LIMITS.min}+. Pluck ${n} more sticker${n === 1 ? '' : 's'} and it'll unlock.`;
  }
  if (e.message === 'native_missing') return 'This needs the installed Pluck app (not Expo Go). See docs/IPHONE_SETUP.md.';
  return e.message;
}
