const RULES = [
  { platform: 'instagram', hosts: ['instagram.com', 'instagr.am'] },
  { platform: 'facebook', hosts: ['facebook.com', 'fb.com', 'fb.watch', 'm.facebook.com'] },
  { platform: 'tiktok', hosts: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'] },
  { platform: 'youtube', hosts: ['youtube.com', 'youtu.be', 'm.youtube.com'] },
  { platform: 'x', hosts: ['x.com', 'twitter.com'] },
  { platform: 'reddit', hosts: ['reddit.com', 'redd.it'] },
];

export function detectPlatform(input) {
  const host = new URL(input).hostname.replace(/^www\./, '');
  const rule = RULES.find((r) => r.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  return rule?.platform ?? 'web';
}

// Tracking params make the same post look like different cache keys.
const JUNK_PARAMS = /^(utm_|igsh|igshid|fbclid|si$|feature$|_r$|_t$|is_from_webapp|sender_device|mibextid|ref$|ref_src)/;

export function canonicalUrl(input) {
  const url = new URL(input);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (JUNK_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.replace(/^(m|mobile)\./, 'www.');
  return url.href;
}

/** YouTube: pull the video id and optional highlighted comment id (`lc=`). */
export function parseYouTube(input) {
  const url = new URL(input);
  let videoId = url.searchParams.get('v');
  if (url.hostname.endsWith('youtu.be')) videoId = url.pathname.slice(1).split('/')[0];
  const shorts = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/);
  if (shorts) videoId = shorts[1];
  return { videoId: videoId || null, commentId: url.searchParams.get('lc') };
}
