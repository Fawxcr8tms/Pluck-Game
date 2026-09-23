import { readFileSync } from 'node:fs';
import { config } from '../config.js';

const bundled = JSON.parse(readFileSync(new URL('./selectors.json', import.meta.url), 'utf8'));
let current = bundled;

export function loadSelectors() {
  return current;
}

/**
 * Pull a newer selectors file from SELECTORS_URL (e.g. a GCS object or a GitHub raw URL you control).
 * Lets you react to a platform's DOM change in minutes. A bad file is ignored and the old one stays.
 */
export async function refreshSelectors() {
  if (!config.selectorsUrl) return current;
  try {
    const res = await fetch(config.selectorsUrl, { signal: AbortSignal.timeout(5_000) });
    const next = await res.json();
    if (next?.platforms?.web && next?.urlPatterns?.strong && next.version !== current.version) {
      current = next;
      console.info(`[selectors] now at ${next.version}`);
    }
  } catch (err) {
    console.warn('[selectors] refresh failed, keeping', current.version, err.message);
  }
  return current;
}
