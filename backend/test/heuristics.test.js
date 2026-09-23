import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { extractCandidates } from '../src/extractors/heuristics.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('finds comment stickers and ranks them above post media', () => {
  const { loginWall, candidates } = extractCandidates(fixture('facebook-post.html'), {
    baseUrl: 'https://www.facebook.com/somepage/posts/1',
    platform: 'facebook',
  });
  assert.equal(loginWall, false);
  const urls = candidates.map((c) => c.url);

  const fbSticker = candidates.find((c) => c.url.includes('t39.1997-6'));
  assert.ok(fbSticker, 'facebook sticker found');
  assert.equal(fbSticker.kind, 'sticker');
  assert.ok(fbSticker.url.includes('_nc_cat=1&ccb=1'), 'html entities decoded');

  const gif = candidates.find((c) => c.url.includes('giphy.com/media/abc123'));
  assert.ok(gif, 'giphy url from embedded JSON found');
  assert.ok(gif.url.includes('cid=1&rid='), 'json escapes decoded');

  assert.ok(!urls.some((u) => u.includes('profile_pic')), 'avatars rejected');
  assert.ok(!urls.some((u) => u.includes('emoji.php')), 'emoji rejected');

  const og = candidates.find((c) => c.via === 'og');
  assert.equal(og.kind, 'post_media');
  assert.ok(candidates.indexOf(og) > candidates.indexOf(fbSticker), 'post media ranked last');
});

test('detects instagram login wall', () => {
  const { loginWall, candidates } = extractCandidates(fixture('instagram-login.html'), {
    baseUrl: 'https://www.instagram.com/accounts/login/?next=/p/abc/',
    platform: 'instagram',
  });
  assert.equal(loginWall, true);
  assert.equal(candidates.filter((c) => c.kind === 'sticker').length, 0);
});

test('survives a DOM redesign via the JSON pass', () => {
  // Same data, but every selector is wrong now.
  const html = `<html><body><section class="x9f8"><i></i></section>
    <script>window.__DATA__={"s":"https:\\/\\/scontent.xx.fbcdn.net\\/v\\/t39.1997-6\\/999_n.webp"}</script></body></html>`;
  const { candidates } = extractCandidates(html, { baseUrl: 'https://www.facebook.com/x', platform: 'facebook' });
  assert.equal(candidates[0]?.url, 'https://scontent.xx.fbcdn.net/v/t39.1997-6/999_n.webp');
  assert.equal(candidates[0].kind, 'sticker');
});
