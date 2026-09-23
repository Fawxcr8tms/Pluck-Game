import { config } from '../config.js';
import { TtlCache } from '../lib/cache.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { canonicalUrl, detectPlatform } from '../lib/platform.js';
import { extractScraped } from './scraped.js';
import { extractYouTube } from './youtube.js';

const cache = new TtlCache({ ttlMs: config.cacheTtlMs });
// If 50 users share the same viral post at once, fetch it once.
const inFlight = new Map();

export async function extractStickers(rawUrl) {
  let key;
  try {
    key = canonicalUrl(rawUrl);
  } catch {
    throw new AppError(ErrorCode.INVALID_URL, 'That does not look like a URL.');
  }
  const cached = cache.get(key);
  if (cached) return { ...cached, cached: true };
  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    const platform = detectPlatform(key);
    const result = platform === 'youtube' ? await extractYouTube(key) : await extractScraped(key, platform);
    const out = { sourceUrl: key, platform, fetchedAt: new Date().toISOString(), fallback: null, warnings: [], ...result };
    // Cache "nothing found" for less time: the post may just be new.
    cache.set(key, out, out.candidates.length ? config.cacheTtlMs : 60_000);
    return out;
  })();

  inFlight.set(key, job);
  try {
    return await job;
  } finally {
    inFlight.delete(key);
  }
}
