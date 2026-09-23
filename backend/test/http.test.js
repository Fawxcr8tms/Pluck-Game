import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ErrorCode } from '../src/lib/errors.js';
import { politeGet } from '../src/lib/http.js';
import { assertPublicUrl, isPrivateIp } from '../src/lib/ssrf.js';

test('blocks private and metadata addresses', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateIp('93.184.216.34'), false);

  await assert.rejects(assertPublicUrl('http://169.254.169.254/latest/meta-data'), { code: ErrorCode.BLOCKED_URL });
  await assert.rejects(assertPublicUrl('file:///etc/passwd'), { code: ErrorCode.BLOCKED_URL });
  const sneaky = async () => [{ address: '10.0.0.5' }]; // public-looking name resolving to a private IP
  await assert.rejects(assertPublicUrl('https://evil.example', { resolve: sneaky }), { code: ErrorCode.BLOCKED_URL });
});

const reply = (status, body = '', headers = {}) =>
  new Response(body, { status, headers });

test('retries after 429 with Retry-After, then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => (++calls === 1 ? reply(429, '', { 'retry-after': '0' }) : reply(200, '<html>ok</html>'));
  const res = await politeGet('http://93.184.216.34/post', { fetchImpl });
  assert.equal(calls, 2);
  assert.equal(res.body.toString(), '<html>ok</html>');
});

test('maps 403 to AUTH_REQUIRED with manual capture fallback', async () => {
  const fetchImpl = async () => reply(403);
  await assert.rejects(politeGet('http://93.184.216.35/post', { fetchImpl }), (err) => {
    assert.equal(err.code, ErrorCode.AUTH_REQUIRED);
    assert.equal(err.fallback, 'manual_capture');
    return true;
  });
});

test('refuses redirects into private networks', async () => {
  const fetchImpl = async () => reply(302, '', { location: 'http://127.0.0.1/admin' });
  await assert.rejects(politeGet('http://93.184.216.36/x', { fetchImpl }), { code: ErrorCode.BLOCKED_URL });
});

test('caps oversized bodies', async () => {
  const fetchImpl = async () => reply(200, 'x'.repeat(2000));
  await assert.rejects(politeGet('http://93.184.216.37/x', { fetchImpl, maxBytes: 1000 }), { code: ErrorCode.UPSTREAM });
});
