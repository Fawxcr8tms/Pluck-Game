import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalUrl, detectPlatform, parseYouTube } from '../src/lib/platform.js';

test('detects platforms', () => {
  assert.equal(detectPlatform('https://www.instagram.com/p/abc/'), 'instagram');
  assert.equal(detectPlatform('https://m.facebook.com/story.php?id=1'), 'facebook');
  assert.equal(detectPlatform('https://vm.tiktok.com/ZM123/'), 'tiktok');
  assert.equal(detectPlatform('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
  assert.equal(detectPlatform('https://notinstagram.com/p/abc'), 'web');
});

test('canonicalUrl strips tracking junk', () => {
  assert.equal(
    canonicalUrl('https://m.facebook.com/p/1?fbclid=abc&story_fbid=9#comments'),
    'https://www.facebook.com/p/1?story_fbid=9',
  );
  assert.equal(canonicalUrl('https://www.instagram.com/p/abc/?igsh=xyz'), 'https://www.instagram.com/p/abc/');
});

test('parses youtube ids', () => {
  assert.deepEqual(parseYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=Ugz123'), { videoId: 'dQw4w9WgXcQ', commentId: 'Ugz123' });
  assert.deepEqual(parseYouTube('https://youtube.com/shorts/dQw4w9WgXcQ'), { videoId: 'dQw4w9WgXcQ', commentId: null });
  assert.deepEqual(parseYouTube('https://youtu.be/dQw4w9WgXcQ?si=x'), { videoId: 'dQw4w9WgXcQ', commentId: null });
});
