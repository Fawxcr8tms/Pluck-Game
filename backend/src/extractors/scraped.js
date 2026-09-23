import { AppError, ErrorCode } from '../lib/errors.js';
import { getHtml, getJson } from '../lib/http.js';
import { extractCandidates } from './heuristics.js';

/**
 * Instagram, Facebook, TikTok and generic sites.
 *
 * What public HTML gives you (as of this writing, and it changes):
 *  - Facebook/Instagram: the first few comments are sometimes server-rendered for public posts.
 *    Usually you hit a login wall. Their official APIs (Graph API, oEmbed) don't expose
 *    other people's comment stickers, so there's no clean API path.
 *  - TikTok: comments load from a signed client-side API, so they are never in the HTML.
 *    oEmbed only gives us the video thumbnail.
 * When we get nothing useful, we say so and point the app at manual capture instead of
 * escalating (no headless logins, no fingerprint spoofing, no CAPTCHA farms).
 */
export async function extractScraped(url, platform) {
  const page = await getHtml(url);
  const { loginWall, candidates, selectorsVersion } = extractCandidates(page.html, { baseUrl: page.url, platform });
  const stickers = candidates.filter((c) => c.kind === 'sticker');
  const warnings = [];

  if (platform === 'tiktok' && stickers.length === 0) {
    const thumb = await tiktokThumbnail(url).catch(() => null);
    if (thumb) candidates.push({ url: thumb, score: 0, via: 'oembed', kind: 'post_media' });
    warnings.push('TikTok loads comments in the app, not the page. Use manual capture for comment stickers.');
    return { candidates, warnings, fallback: 'manual_capture', selectorsVersion };
  }

  if (loginWall && stickers.length === 0) {
    throw new AppError(ErrorCode.AUTH_REQUIRED, `This ${platform} post is behind a login wall.`, { fallback: 'manual_capture' });
  }

  if (stickers.length === 0) warnings.push('No sticker-like images found. Showing all images on the page instead.');
  return { candidates, warnings, selectorsVersion };
}

async function tiktokThumbnail(url) {
  const data = await getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
  return data.thumbnail_url ?? null;
}
