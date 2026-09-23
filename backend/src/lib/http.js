import { config } from '../config.js';
import { AppError, ErrorCode } from './errors.js';
import { KeyedTokenBucket } from './rateLimiter.js';
import { assertPublicUrl } from './ssrf.js';

const hostBuckets = new KeyedTokenBucket(config.hostRate);
// When an upstream says "back off", every request to that host waits, not just the one that got the 429.
const hostCooldownUntil = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRetryAfter(header) {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return secs;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/** Exponential backoff with full jitter: 0..min(cap, base * 2^attempt). */
export function backoffMs(attempt, { baseMs = 500, capMs = 8_000 } = {}) {
  return Math.random() * Math.min(capMs, baseMs * 2 ** attempt);
}

async function readCapped(res, maxBytes) {
  const len = Number(res.headers.get('content-length'));
  if (len > maxBytes) throw new AppError(ErrorCode.UPSTREAM, 'Upstream response too large.');
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > maxBytes) throw new AppError(ErrorCode.UPSTREAM, 'Upstream response too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Polite, SSRF-safe GET.
 * - vets every redirect hop against private networks
 * - per-host token bucket + shared cooldown after 429/503
 * - retries 429/5xx/network errors with jittered backoff, honouring Retry-After
 * - caps body size
 */
export async function politeGet(rawUrl, { accept = 'text/html', maxBytes = config.http.maxHtmlBytes, headers = {}, fetchImpl = fetch } = {}) {
  let url = await assertPublicUrl(rawUrl);

  for (let attempt = 0; ; attempt++) {
    const cooldown = (hostCooldownUntil.get(url.host) ?? 0) - Date.now();
    if (cooldown > 0) await sleep(cooldown);
    await hostBuckets.take(url.host).catch(() => {
      throw new AppError(ErrorCode.RATE_LIMITED, 'Too many requests to this site right now.', { retryAfterSec: 30 });
    });

    let res;
    try {
      res = await fetchImpl(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(config.http.timeoutMs),
        headers: { 'user-agent': config.http.userAgent, accept, 'accept-language': 'en', ...headers },
      });
    } catch (err) {
      if (attempt < config.http.maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new AppError(ErrorCode.UPSTREAM, `Could not reach ${url.host}.`, { cause: err });
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (attempt >= 5) throw new AppError(ErrorCode.UPSTREAM, 'Too many redirects.');
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).href);
      continue; // redirects don't count as failures, but are bounded by `attempt`
    }

    if (res.status === 429 || res.status === 503) {
      const retryAfter = parseRetryAfter(res.headers.get('retry-after')) ?? 2 ** (attempt + 1);
      hostCooldownUntil.set(url.host, Date.now() + retryAfter * 1000);
      if (attempt < config.http.maxRetries && retryAfter <= 10) {
        await sleep(retryAfter * 1000 + backoffMs(0));
        continue;
      }
      throw new AppError(ErrorCode.RATE_LIMITED, `${url.host} is rate limiting us.`, { retryAfterSec: retryAfter });
    }

    if (res.status >= 500 && attempt < config.http.maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }

    if (res.status === 404 || res.status === 410) throw new AppError(ErrorCode.NOT_FOUND, 'That post no longer exists or is private.');
    if (res.status === 401 || res.status === 403) {
      throw new AppError(ErrorCode.AUTH_REQUIRED, `${url.host} requires a login to view this.`, { fallback: 'manual_capture' });
    }
    if (!res.ok) throw new AppError(ErrorCode.UPSTREAM, `${url.host} answered ${res.status}.`);

    const body = await readCapped(res, maxBytes);
    return { url: url.href, status: res.status, headers: res.headers, body };
  }
}

export async function getHtml(url, opts) {
  const res = await politeGet(url, opts);
  return { ...res, html: res.body.toString('utf8') };
}

export async function getJson(url, opts) {
  const res = await politeGet(url, { accept: 'application/json', ...opts });
  return JSON.parse(res.body.toString('utf8'));
}
