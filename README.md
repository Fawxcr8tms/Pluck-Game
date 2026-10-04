# Pluck 🦅

**Rescue stickers from the comment section.** Screenshot a comment, share it to Pluck, tap the sticker: Pluck cuts it out and adds it to your own WhatsApp sticker pack. You can also paste a post link and let the backend hunt for stickers.

**iPhone setup:** [docs/IPHONE_SETUP.md](docs/IPHONE_SETUP.md)

```
backend/   Node 20+ · Express 5 · cheerio · sharp · firebase-admin   (extractor + import API)
mobile/    Expo SDK 57 · React Native · Swift module (Vision cut-out, WhatsApp packs) · optional Firebase sync
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
# .env is optional: without Firebase the vault lives on the phone only
npm install && npx expo install --fix
npx expo run:ios --device         # or a cloud build: see docs/IPHONE_SETUP.md
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
- **No OS lets third-party apps add to Gboard's or iOS's built-in sticker trays.** WhatsApp packs are written for iPhone (untested on a device yet); iMessage and Android packs aren't. See [docs/EXPORT.md](docs/EXPORT.md).
- **Apps can't add a button inside Instagram or TikTok**, so the flow starts from a screenshot.
- Respect each platform's Terms of Service and the sticker creators' rights. The vault is private by design.
