import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { getDownloadURL } from 'firebase-admin/storage';
import { config } from '../config.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { bucket, db } from '../lib/firebase.js';
import { politeGet } from '../lib/http.js';
import { normalizeSticker } from '../lib/image.js';

export const stickersRouter = Router();

const PLATFORMS = new Set(['instagram', 'facebook', 'tiktok', 'youtube', 'x', 'reddit', 'web', 'manual']);

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t).trim().toLowerCase().slice(0, 32)).filter(Boolean))].slice(0, 20);
}

/**
 * POST /v1/stickers/import
 *   { imageUrl }     - a candidate from /v1/extract
 *   { imageBase64 }  - a manual capture (screenshot crop / shared image) from the device
 *   + { sourceUrl?, platform?, tags? }
 *
 * Downloads, normalises to a 512px WebP, stores in Cloud Storage, writes users/{uid}/stickers/{sha256}.
 * The doc id is the content hash, so saving the same sticker twice is a no-op.
 */
stickersRouter.post('/import', async (req, res) => {
  const { imageUrl, imageBase64, sourceUrl = null, platform = 'manual', tags } = req.body ?? {};
  if (!imageUrl && !imageBase64) throw new AppError(ErrorCode.INVALID_URL, 'Send imageUrl or imageBase64.');

  let original;
  if (imageBase64) {
    original = Buffer.from(String(imageBase64).replace(/^data:[^,]+,/, ''), 'base64');
    if (original.length > config.http.maxImageBytes) throw new AppError(ErrorCode.UNSUPPORTED_MEDIA, 'Image too large.');
  } else {
    ({ body: original } = await politeGet(imageUrl, { accept: 'image/*', maxBytes: config.http.maxImageBytes }));
  }

  const { sticker, thumb, meta } = await normalizeSticker(original);
  const ref = db().doc(`users/${req.uid}/stickers/${meta.sha256}`);
  const existing = await ref.get();
  if (existing.exists) return res.json({ sticker: { id: ref.id, ...existing.data() }, duplicate: true });

  const base = `users/${req.uid}/stickers/${meta.sha256}`;
  const stickerFile = bucket().file(`${base}.webp`);
  const thumbFile = bucket().file(`${base}_thumb.webp`);
  const cacheControl = 'public, max-age=31536000, immutable'; // content-addressed, never changes
  await Promise.all([
    stickerFile.save(sticker, { contentType: 'image/webp', metadata: { cacheControl } }),
    thumbFile.save(thumb, { contentType: 'image/webp', metadata: { cacheControl } }),
  ]);

  const doc = {
    ...meta,
    url: await getDownloadURL(stickerFile),
    thumbUrl: await getDownloadURL(thumbFile),
    storagePath: stickerFile.name,
    originalUrl: imageUrl ?? null,
    sourceUrl,
    sourcePlatform: PLATFORMS.has(platform) ? platform : 'web',
    tags: cleanTags(tags),
    favorite: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc);
  res.status(201).json({ sticker: { id: ref.id, ...doc, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
});

/** DELETE /v1/stickers/:id - removes the Firestore doc and both Storage objects. */
stickersRouter.delete('/:id', async (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(req.params.id)) throw new AppError(ErrorCode.NOT_FOUND, 'No such sticker.');
  const base = `users/${req.uid}/stickers/${req.params.id}`;
  await Promise.all([
    bucket().file(`${base}.webp`).delete({ ignoreNotFound: true }),
    bucket().file(`${base}_thumb.webp`).delete({ ignoreNotFound: true }),
  ]);
  await db().doc(base).delete();
  res.status(204).end();
});
