import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { AppError, ErrorCode } from './errors.js';

// This service fetches URLs that users hand it. Without these checks it is an
// open proxy into your cloud network (metadata server, internal services, ...).
const PRIVATE_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function v4ToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

/** Parse and vet a user-supplied URL. Throws AppError on anything sketchy. */
export async function assertPublicUrl(raw, { resolve = lookup } = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(ErrorCode.INVALID_URL, 'That does not look like a URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError(ErrorCode.BLOCKED_URL, 'Only http(s) links are supported.');
  }
  if (url.username || url.password) {
    throw new AppError(ErrorCode.BLOCKED_URL, 'Links with credentials are not allowed.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await resolve(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new AppError(ErrorCode.INVALID_URL, `Could not resolve ${host}.`);
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new AppError(ErrorCode.BLOCKED_URL, 'That host is not reachable from here.');
  }
  return url;
}
