export const config = {
  port: Number(process.env.PORT ?? 8080),
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? '',
  devNoAuth: process.env.DEV_NO_AUTH === 'true',
  selectorsUrl: process.env.SELECTORS_URL ?? '',

  http: {
    timeoutMs: 10_000,
    maxRetries: 3,
    maxHtmlBytes: 5 * 1024 * 1024,
    maxImageBytes: 8 * 1024 * 1024,
    // An honest UA. Pretending to be a logged-in browser is how you get IP-banned.
    userAgent: 'PluckBot/0.1 (+https://github.com/fawxcr8tms/pluck-game)',
  },

  // Outbound politeness: requests per second per upstream host.
  hostRate: { perSecond: 1, burst: 3 },
  // Inbound: requests per minute per client (uid or IP).
  clientRate: { perMinute: 30 },

  cacheTtlMs: 10 * 60 * 1000,
};
