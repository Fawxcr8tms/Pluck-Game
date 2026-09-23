import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AppError, ErrorCode } from './errors.js';

const ALLOWED = new Set(['jpeg', 'png', 'gif', 'webp', 'avif']);
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// WhatsApp third-party sticker rules: 512x512 WebP, static <= 100 KB, animated <= 500 KB.
const WA = { size: 512, staticMax: 100 * 1024, animatedMax: 500 * 1024 };

async function encodeUnder(input, { animated, maxBytes }) {
  let out;
  for (const quality of [85, 70, 55, 40, 25]) {
    out = await sharp(input, { animated, limitInputPixels: 50_000_000 })
      .resize(WA.size, WA.size, { fit: 'contain', background: TRANSPARENT })
      .webp({ quality, effort: 4, loop: 0 })
      .toBuffer();
    if (out.length <= maxBytes) return { buffer: out, fits: true };
  }
  return { buffer: out, fits: false };
}

/**
 * Normalise any downloaded image into a vault-ready sticker:
 * 512x512 transparent-padded WebP (animation kept) + a small static thumbnail.
 * The main file already fits WhatsApp's pack rules, so exporting later needs no re-encode.
 */
export async function normalizeSticker(input) {
  let meta;
  try {
    meta = await sharp(input, { animated: true }).metadata();
  } catch {
    throw new AppError(ErrorCode.UNSUPPORTED_MEDIA, 'That file is not an image we can read.');
  }
  if (!ALLOWED.has(meta.format)) throw new AppError(ErrorCode.UNSUPPORTED_MEDIA, `Unsupported image type: ${meta.format}.`);

  const animated = (meta.pages ?? 1) > 1;
  const sticker = await encodeUnder(input, { animated, maxBytes: animated ? WA.animatedMax : WA.staticMax });
  const thumb = await sharp(input, { animated: false })
    .resize(192, 192, { fit: 'contain', background: TRANSPARENT })
    .webp({ quality: 70 })
    .toBuffer();

  return {
    sticker: sticker.buffer,
    thumb,
    meta: {
      sha256: createHash('sha256').update(sticker.buffer).digest('hex'),
      animated,
      originalFormat: meta.format,
      originalWidth: meta.width,
      originalHeight: meta.pageHeight ?? meta.height,
      bytes: sticker.buffer.length,
      whatsappCompatible: sticker.fits,
    },
  };
}
