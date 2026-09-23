const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** Share sheets hand us "Check this out! https://..." – dig the link out. */
export function findUrl(text) {
  return text?.match(URL_RE)?.[0]?.replace(/[).,!?]+$/, '') ?? null;
}

const SOCIAL = /(^|\.)(instagram\.com|instagr\.am|facebook\.com|fb\.watch|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|reddit\.com)$/i;

export function isSocialUrl(url) {
  try {
    return SOCIAL.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^(www|m)\./, '');
    if (/instagram\.com|instagr\.am/.test(host)) return 'instagram';
    if (/facebook\.com|fb\.watch|fb\.com/.test(host)) return 'facebook';
    if (/tiktok\.com/.test(host)) return 'tiktok';
    if (/youtube\.com|youtu\.be/.test(host)) return 'youtube';
    if (/x\.com|twitter\.com/.test(host)) return 'x';
    if (/reddit\.com|redd\.it/.test(host)) return 'reddit';
  } catch {}
  return 'web';
}
