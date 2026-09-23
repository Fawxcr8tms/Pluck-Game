import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.DEV_NO_AUTH = 'true';
const { createApp } = await import('../src/app.js');

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('rejects garbage urls with a stable error code', async () => {
  const res = await post('/v1/extract', { url: 'not a url' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_URL');
});

test('refuses to fetch internal addresses', async () => {
  const res = await post('/v1/extract', { url: 'http://169.254.169.254/computeMetadata/v1/' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'BLOCKED_URL');
});
