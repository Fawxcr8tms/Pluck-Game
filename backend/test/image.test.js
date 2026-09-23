import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { normalizeSticker } from '../src/lib/image.js';

test('normalises to a WhatsApp-compatible 512x512 webp', async () => {
  const png = await sharp({ create: { width: 800, height: 300, channels: 4, background: '#ff5a5f' } }).png().toBuffer();
  const { sticker, thumb, meta } = await normalizeSticker(png);
  const out = await sharp(sticker).metadata();
  assert.equal(out.format, 'webp');
  assert.equal(out.width, 512);
  assert.equal(out.height, 512);
  assert.equal(meta.animated, false);
  assert.equal(meta.whatsappCompatible, true);
  assert.match(meta.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await sharp(thumb).metadata()).width, 192);
});

test('rejects non-images', async () => {
  await assert.rejects(normalizeSticker(Buffer.from('<svg onload=alert(1)>')), { code: 'UNSUPPORTED_MEDIA' });
});
