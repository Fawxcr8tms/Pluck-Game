# Pluck 🦅

**Rescue stickers from the comment section.** Share a post from Instagram, TikTok, Facebook or YouTube to Pluck. It finds the stickers in the comments and saves the ones you pick to a private vault that syncs across your devices. From there you can send them anywhere.

```
backend/   Node 20+ · Express 5 · cheerio · sharp · firebase-admin   (extractor + import API)
mobile/    Expo SDK 57 · React Native · Firebase JS SDK               (vault, import, export)
firebase/  Firestore + Storage security rules and indexes
docs/      ARCHITECTURE · EDGE_CASES · EXPORT
```

## Quick start

```bash
# 1. Backend
cd backend
cp .env.example .env              # add YOUTUBE_API_KEY, FIREBASE_STORAGE_BUCKET, credentials
npm install
npm test                          # 15 tests: heuristics, SSRF, retries, image pipeline, API
npm run dev                       # :8080

# Try it without Firebase auth:
DEV_NO_AUTH=true npm run dev
curl -s localhost:8080/v1/extract -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# 2. Firebase
firebase deploy --only firestore,storage   # enable Anonymous Auth in the console too

# 3. App (needs a dev build: share extensions don't run in Expo Go)
cd ../mobile
cp .env.example .env              # API URL + Firebase web config
npm install && npx expo install --fix
npx expo run:ios                  # or run:android
```

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/v1/extract` | `{ url }` | `{ platform, sourceUrl, candidates[{url, kind, score, via}], warnings[], fallback }` |
| `POST` | `/v1/stickers/import` | `{ imageUrl \| imageBase64, sourceUrl?, platform?, tags? }` | `{ sticker, duplicate? }` |
| `DELETE` | `/v1/stickers/:id` | none | `204` |

Errors always look like `{ error: { code, message, retryAfterSec?, fallback? } }`. Codes: `INVALID_URL`, `BLOCKED_URL`, `AUTH_REQUIRED`, `RATE_LIMITED`, `NOT_FOUND`, `NO_STICKERS`, `UPSTREAM`, `UNSUPPORTED_MEDIA`, `UNAUTHENTICATED`.

## Honest limitations

- **Instagram, Facebook and TikTok hide most comments behind logins or client-side APIs.** Pluck doesn't bypass that. It falls back to *manual capture*: screenshot the comment, then crop the sticker. See [docs/EDGE_CASES.md](docs/EDGE_CASES.md).
- **YouTube comments can't contain image stickers.** Pluck only finds images that people linked.
- **No OS lets third-party apps add to Gboard's or iOS's built-in sticker trays.** Share, copy/paste and Photos work now. WhatsApp and iMessage packs need native modules that aren't written yet. See [docs/EXPORT.md](docs/EXPORT.md).
- Respect each platform's Terms of Service and the sticker creators' rights. The vault is private by design.
