import * as cheerio from 'cheerio';
import { loadSelectors } from './selectors.js';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i;
const IMAGE_HOST = /(fbcdn\.net|cdninstagram\.com|tiktokcdn[\w-]*\.com|giphy\.com|tenor\.com|redd\.it|redditmedia\.com|ggpht\.com|ytimg\.com|imgur\.com)/i;
// URLs inside inline <script> blobs, including JSON-escaped ones (https:\/\/...).
const URL_IN_TEXT = /https?:(?:\\?\/){2}(?:[^\s"'<>\\]|\\\/|\\u0026)+/g;

function unescapeJsonUrl(s) {
  return s.replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
}

function toAbsolute(src, baseUrl) {
  try {
    return new URL(unescapeJsonUrl(src), baseUrl).href;
  } catch {
    return null;
  }
}

function compile(patterns) {
  return patterns.map((p) => new RegExp(p, 'i'));
}

function bestSrc($img) {
  // Largest srcset entry beats src (src is often a blurred placeholder).
  const srcset = $img.attr('srcset') || $img.attr('data-srcset');
  if (srcset) {
    const best = srcset
      .split(',')
      .map((part) => part.trim().split(/\s+/))
      .map(([u, w]) => ({ u, w: parseFloat(w) || 0 }))
      .sort((a, b) => b.w - a.w)[0];
    if (best?.u) return best.u;
  }
  return $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
}

export function detectLoginWall($, platformSelectors, finalUrl = '') {
  if (/\/(accounts\/)?login|\/checkpoint\//i.test(new URL(finalUrl || 'http://x').pathname)) return true;
  if (platformSelectors.loginWall.some((sel) => $(sel).length > 0)) return true;
  const title = $('title').text().trim().toLowerCase();
  return /^(log ?in|sign ?in)\b|log in or sign up|login • instagram/.test(title);
}

/**
 * Turn a page's HTML into ranked sticker candidates.
 * Three independent passes, so one breaking (e.g. a DOM redesign) degrades results instead of zeroing them:
 *   1. selector pass    - images inside comment containers (precise, brittle)
 *   2. embedded JSON    - URLs inside <script> payloads (robust to markup changes)
 *   3. og:image         - the post's own media, as a low-ranked fallback
 */
export function extractCandidates(html, { baseUrl, platform = 'web', selectors = loadSelectors() }) {
  const $ = cheerio.load(html);
  const ps = selectors.platforms[platform] ?? selectors.platforms.web;
  const strong = compile(selectors.urlPatterns.strong);
  const reject = compile(selectors.urlPatterns.reject);

  const loginWall = detectLoginWall($, ps, baseUrl);
  const found = new Map();

  const add = (rawSrc, { via, inComment = false, width, height, alt }) => {
    const url = rawSrc && toAbsolute(rawSrc, baseUrl);
    if (!url || url.startsWith('data:')) return;
    if (reject.some((re) => re.test(url))) return;
    const w = Number(width) || undefined;
    const h = Number(height) || undefined;
    if (w && h && (w < 40 || h < 40)) return; // inline emoji, reaction icons

    let score = 0;
    if (inComment) score += 3;
    if (strong.some((re) => re.test(url))) score += 3;
    if (/\.(gif|webp)(\?|$)/i.test(url)) score += 1;
    if (w && h && w / h > 0.8 && w / h < 1.25) score += 1;
    if (alt && /sticker|gif/i.test(alt)) score += 2;
    if (via === 'og') score = Math.min(score, 1);

    const prev = found.get(url);
    if (!prev || prev.score < score) {
      found.set(url, { url, score, via, width: w, height: h, kind: score >= 3 ? 'sticker' : via === 'og' ? 'post_media' : 'image' });
    }
  };

  // 1. Selector pass
  const inCommentImgs = new Set();
  for (const container of ps.commentContainers) {
    $(container).find('img').each((_, el) => {
      inCommentImgs.add(el);
    });
  }
  for (const sel of ps.stickerImages) {
    $(sel).each((_, el) => {
      const $img = $(el);
      add(bestSrc($img), {
        via: 'selector',
        inComment: inCommentImgs.has(el),
        width: $img.attr('width'),
        height: $img.attr('height'),
        alt: $img.attr('alt'),
      });
    });
  }
  for (const el of inCommentImgs) {
    const $img = $(el);
    add(bestSrc($img), { via: 'selector', inComment: true, width: $img.attr('width'), height: $img.attr('height'), alt: $img.attr('alt') });
  }

  // 2. Embedded JSON pass
  $('script').each((_, el) => {
    const text = $(el).text();
    if (text.length < 20) return;
    for (const m of text.matchAll(URL_IN_TEXT)) {
      const url = unescapeJsonUrl(m[0]);
      if (!IMAGE_EXT.test(url) && !IMAGE_HOST.test(url)) continue;
      // Only keep script URLs that look sticker-ish; otherwise we'd return every thumbnail on the page.
      if (!strong.some((re) => re.test(url))) continue;
      add(url, { via: 'json' });
    }
  });

  // 3. og:image
  const og = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
  if (og) add(og, { via: 'og' });

  const candidates = [...found.values()].sort((a, b) => b.score - a.score).slice(0, 60);
  return { loginWall, candidates, selectorsVersion: selectors.version };
}
