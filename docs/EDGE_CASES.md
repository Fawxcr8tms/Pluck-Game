# Edge cases: login walls, rate limits, DOM churn

The ground rule: **degrade gracefully, never escalate.** When a platform says no, Pluck offers the user a manual path instead of trying to beat the platform's defences.

## 1. Authentication walls

| Platform | What the server can see without logging in | What Pluck does |
|---|---|---|
| **YouTube** | Everything, through the official Data API (API key, 10k quota units/day by default). Comments can't hold image stickers, only links. | Uses the API and pulls linked GIPHY/Tenor/image URLs. A warning explains the limitation. |
| **Facebook** | Some public posts render a few comments server-side. Most return a login interstitial. | Runs the heuristics. A login wall with no stickers → `422 AUTH_REQUIRED` + `fallback: manual_capture`. |
| **Instagram** | Almost always a login redirect (`/accounts/login`). | Same as Facebook. |
| **TikTok** | The page loads, but comments come from a signed client-side API and are never in the HTML. | Returns the oEmbed thumbnail as `post_media`, a warning, and `fallback: manual_capture`. |
| **Reddit / forums / generic** | Usually full HTML. | Heuristics. |

How a login wall is detected (`heuristics.js#detectLoginWall`): the final URL path after redirects (`/login`, `/accounts/login`, `/checkpoint`), per-platform selectors (`form#login_form`, `input[name=username]`), and the page `<title>`. HTTP 401/403 map to `AUTH_REQUIRED` as well.

**Deliberately not done:** headless browsers logged in with shared accounts, harvesting user cookies on the server, CAPTCHA solving, residential proxy rotation, or fingerprint spoofing. They break platform terms, get accounts banned, and are an arms race you lose. The manual-capture fallback is one extra tap for the user, and it always works because the user is already looking at the sticker.

If you later want more coverage, the clean upgrade is **on-device extraction**: the user opens the post in an in-app WebView *with their own session*, and injected JS collects `<img>` URLs from the visible comments. No credentials ever reach the server. It is still a grey area under Meta's and TikTok's terms, so get legal advice first.

## 2. Rate limiting

There are three layers, all in `backend/src/lib`:

1. **Inbound, per user:** a token bucket keyed by Firebase uid (30/min). Returns `429` + `Retry-After`, and the app shows "try again in N min".
2. **Outbound, per upstream host:** a token bucket at 1 req/s with a burst of 3. Requests *queue* instead of failing, up to 15 s.
3. **Upstream pushback:** on `429`/`503`, the server reads `Retry-After` and sets a **host-wide cooldown**, so every request to that host waits, not just the one that got the 429. Short waits (≤10 s) are retried with jittered exponential backoff. Longer ones return `RATE_LIMITED` with `retryAfterSec`.

On top of that:
- **Caching:** results are cached for 10 minutes per canonical URL. Empty results are cached for only 60 s, because the post may just be new.
- **In-flight de-duplication:** if 50 people share the same viral post in the same second, it gets fetched once.
- **YouTube quota:** a 403 from the Data API maps to `RATE_LIMITED` (quota), not `AUTH_REQUIRED`.
- **Scaling out:** with more than one instance, move the buckets, cooldowns and cache to Redis, or the limits multiply by your instance count.

## 3. Changing DOM structures

Social sites ship obfuscated, frequently-changing class names. The extractor is built so a redesign *degrades* results instead of zeroing them:

- **Three independent passes.** The embedded-JSON and URL-pattern passes don't depend on markup. `test/heuristics.test.js › survives a DOM redesign` proves the JSON pass still finds a Facebook sticker when every selector misses.
- **Selectors are data, not code.** `extractors/selectors.json` is versioned. Point `SELECTORS_URL` at a copy you host and the server hot-reloads it every 15 minutes. A malformed file is ignored.
- **Semantic anchors over class names:** `role="article"`, `aria-label*="omment"`, `data-e2e`, and CDN path signatures such as Facebook stickers under `/t39.1997-6/` and Instagram avatars under `/t51.2885-19/`. These change far less often than CSS classes.
- **Scored, not binary.** A candidate doesn't need every signal to match. The response includes `selectorsVersion` so you can correlate breakage with a version.
- **Monitoring (recommended next step):** a nightly job that runs a list of known public posts and alerts when the sticker count for a platform drops to zero. Add each broken page as a fixture test once it's fixed.

## 4. Other things that bite

| Case | Handling |
|---|---|
| **SSRF:** a user submits `http://169.254.169.254/...` or a domain resolving to `10.x` | `lib/ssrf.js` resolves DNS and blocks private, loopback, link-local, CGNAT and metadata ranges. It re-checks **every redirect hop**. Residual risk: DNS rebinding between the check and the connect. Close it with a custom undici `Agent` whose `connect.lookup` enforces the same check. |
| Huge pages or images | Bodies are capped (5 MB HTML, 8 MB image) while streaming, and sharp's `limitInputPixels` stops decompression bombs. |
| SVG / HTML posing as an image | Only jpeg/png/gif/webp/avif decoded by sharp are accepted. Everything is re-encoded, so nothing user-supplied is served as-is. |
| Duplicate saves | The doc id is the SHA-256 of the normalised WebP. |
| Animated sticker over 500 KB | Encoded at stepped-down quality. If it still doesn't fit, it's saved with `whatsappCompatible: false` and the UI says why. |
| Tracking params / mobile hosts | Canonicalised before caching (`m.facebook.com` → `www.`, `igsh`, `fbclid`, `si`, `utm_*` stripped). |
| Offline | The vault paints from the local index and exports from local files. Firestore errors show "Offline: showing your saved copy" and never blank the grid. |
| iOS clipboard privacy banner | The app only calls `hasUrlAsync()` on foreground, which doesn't trigger the banner. It reads the clipboard only when the user taps. |
| Download URLs | Firebase download URLs carry a token that bypasses Storage rules. They are unguessable and only stored in the owner's private docs, but for stricter privacy, serve images through short-lived signed URLs instead. |
| Copyright / takedowns | Stickers are saved to a **private** per-user vault (rules deny cross-user reads). There is no public sharing or discovery surface. Keep it that way unless you add a DMCA process. |
