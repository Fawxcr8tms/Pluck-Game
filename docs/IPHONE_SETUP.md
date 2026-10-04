# Getting Pluck onto your iPhone

**The flow:** screenshot a comment → share the screenshot to Pluck → tap the sticker → Pluck cuts it out → once you have 3, tap **Send** and WhatsApp asks "Add to WhatsApp?".

Pluck includes its own native iPhone code (the cut-out and the WhatsApp hand-off), so **Expo Go can't run it**. You need a real build. Your options:

| | A. No computer (recommended for you) | B. With a Mac |
|---|---|---|
| Cost | **Apple Developer Program, $99/year.** Expo account is free; the free tier includes a limited number of cloud builds a month. | Free (Apple ID + Xcode) |
| Needs | iPhone + any browser (your iPad works) | A Mac with Xcode, a USB cable |
| How it reaches the phone | TestFlight app | Installed straight from Xcode |
| Catch | Apple's review of TestFlight *internal* testing is skipped, but the first upload still takes ~15–30 min to process | Free builds expire after **7 days**, then you reinstall |

There's no free *and* computer-free way to put a custom app on an iPhone. That's Apple's rule, not ours.

## Option A: cloud build + TestFlight (no computer)

You do the account steps (they need your identity and payment); the build commands can run from this cloud workspace.

1. **Join the Apple Developer Program**: developer.apple.com/programs → Enroll (sign in with your Apple ID, pay $99). Approval can take up to 48 hours.
2. **Create a free Expo account**: expo.dev/signup.
3. **Make an Expo access token**: expo.dev → Account settings → Access tokens → Create. Copy it.
4. **Add it to this environment as a secret** named `EXPO_TOKEN` (Claude can show you where; it's in the environment settings), then ask Claude to run the build.
5. Claude runs:
   ```bash
   cd mobile
   npx eas-cli build --platform ios --profile preview    # asks for Apple login once to create certificates
   npx eas-cli submit --platform ios --latest            # uploads to App Store Connect / TestFlight
   ```
   The first `build` needs your Apple ID login to create signing certificates. Do that step yourself in a terminal you control, or let EAS's web flow handle it: never paste your Apple password into a chat.
6. On your iPhone install **TestFlight** from the App Store, accept the invite email, install Pluck.

## Option B: Mac + Xcode (free, 7-day builds)

```bash
cd mobile
npm install && npx expo install --fix
npx expo prebuild --platform ios
npx expo run:ios --device          # pick your iPhone; sign with your free Apple ID in Xcode when asked
```
On the iPhone: Settings → General → VPN & Device Management → trust your developer certificate.

## Using it

1. In Instagram/TikTok/Facebook, screenshot the comment with the sticker.
2. Tap the screenshot preview → Share → **Pluck** (first time: scroll the share row → More → enable Pluck).
3. Tap the sticker. On iOS 17+ it's cut out automatically; on iOS 16 you get a square crop.
4. Save. After your 3rd sticker, tap **Send** on the WhatsApp card → WhatsApp opens → **Add to WhatsApp**.
5. New stickers join the same pack (up to 30, then "Pluck 2" starts). Tap Send again to update the pack in WhatsApp.

Also works: long-press a sticker in Photos → **Copy** → in Pluck tap **📋 Paste**.

## Known gaps (honest list)

- **Never compiled or run yet.** The Swift code is written against Expo SDK 57's module API, but there was no Mac available to compile it. Expect a fix-up round on the first build.
- **WhatsApp always asks you to confirm.** No app can add stickers silently.
- **WhatsApp on iPad** may not accept third-party packs; this targets WhatsApp on iPhone.
- **Animated stickers** come out static (a screenshot is a still image).
