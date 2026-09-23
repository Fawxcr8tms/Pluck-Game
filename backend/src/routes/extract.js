import { Router } from 'express';
import { AppError, ErrorCode } from '../lib/errors.js';
import { extractStickers } from '../extractors/index.js';

export const extractRouter = Router();

/**
 * POST /v1/extract  { url }
 * -> { sourceUrl, platform, candidates: [{ url, score, kind, via, width?, height? }], warnings, fallback }
 * Returns candidates only. Nothing is saved until the user picks some (see /v1/stickers/import).
 */
extractRouter.post('/', async (req, res) => {
  const url = req.body?.url;
  if (typeof url !== 'string' || url.length > 2048) throw new AppError(ErrorCode.INVALID_URL, 'Send { "url": "https://..." }.');
  const result = await extractStickers(url.trim());
  if (result.candidates.length === 0 && !result.fallback) {
    throw new AppError(ErrorCode.NO_STICKERS, 'No stickers found on that page.', { fallback: 'manual_capture' });
  }
  res.json(result);
});
