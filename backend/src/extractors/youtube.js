import { config } from '../config.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { getJson } from '../lib/http.js';
import { parseYouTube } from '../lib/platform.js';

const API = 'https://www.googleapis.com/youtube/v3';
const LINKED_IMAGE = /https?:\/\/[^\s"'<>]+?(?:\.(?:gif|png|webp|jpe?g)|giphy\.com\/(?:gifs|media)\/[^\s"'<>]+|tenor\.com\/view\/[^\s"'<>]+)/gi;

/**
 * YouTube is the one platform here with an official, key-based comments API, so we use it instead of scraping.
 * Heads-up: YouTube comments can't hold image stickers. We can only surface images people *linked*
 * (GIPHY/Tenor/direct image URLs). The response says so, so the UI can tell the user.
 */
export async function extractYouTube(url) {
  const { videoId, commentId } = parseYouTube(url);
  if (!videoId && !commentId) throw new AppError(ErrorCode.INVALID_URL, 'Could not find a video id in that YouTube link.');
  if (!config.youtubeApiKey) throw new AppError(ErrorCode.UPSTREAM, 'YOUTUBE_API_KEY is not configured on the server.');

  const params = new URLSearchParams({ part: 'snippet,replies', maxResults: '100', textFormat: 'html', key: config.youtubeApiKey });
  if (commentId) params.set('id', commentId);
  else params.set('videoId', videoId);

  let data;
  try {
    data = await getJson(`${API}/commentThreads?${params}`);
  } catch (err) {
    // The Data API answers 403 for quota exhaustion and disabled comments, not for login walls.
    if (err.code === ErrorCode.AUTH_REQUIRED) {
      throw new AppError(ErrorCode.RATE_LIMITED, 'YouTube API quota is used up or comments are disabled.', { retryAfterSec: 3600 });
    }
    throw err;
  }

  const texts = [];
  for (const thread of data.items ?? []) {
    texts.push(thread.snippet?.topLevelComment?.snippet?.textDisplay ?? '');
    for (const reply of thread.replies?.comments ?? []) texts.push(reply.snippet?.textDisplay ?? '');
  }

  const seen = new Set();
  const candidates = [];
  for (const text of texts) {
    for (const m of text.replace(/&amp;/g, '&').matchAll(LINKED_IMAGE)) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      candidates.push({ url: m[0], score: 3, via: 'api', kind: 'sticker' });
    }
  }

  return {
    candidates,
    warnings: ['YouTube comments cannot contain image stickers; only linked images were found.'],
  };
}
