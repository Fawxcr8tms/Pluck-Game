# Export & keyboard integration: what's actually possible

Short version: **no mobile OS lets a third-party app add stickers to the system keyboard's own sticker tray.** Every app that looks like it does is using one of the routes below.

| Target | Route | Status in this repo |
|---|---|---|
| Any messaging app (WhatsApp, Telegram, iMessage, Signal, Discord, …) | **System share sheet** (`expo-sharing`) with the local WebP | ✅ Works in the app now |
| Any keyboard that pastes images (Gboard, SwiftKey, iOS keyboard in apps that accept images) | **Copy image to clipboard** (`expo-clipboard#setImageAsync`), then paste | ✅ Works now. Static only: the clipboard keeps the first frame of animated stickers. |
| Photos / gallery | `expo-media-library#saveToLibraryAsync` | ✅ Works now. After that the user can make an iOS 17+ system sticker from Photos themselves. |
| **WhatsApp sticker packs** | WhatsApp's official third-party pack API | 🟡 **iOS written** (`mobile/modules/pluck-native`), not yet tested on a device. Android not written. |
| **iMessage sticker drawer** | An iMessage app extension (`MSStickerBrowserViewController`) reading from a shared App Group | 🟡 Needs an extension target |
| **Telegram packs** | Telegram's sticker-import intent (Android: `org.telegram.messenger.CREATE_STICKER_PACK`) | 🟡 Needs native module |
| **Gboard sticker tray** | Gboard used to take third-party packs through Firebase App Indexing's Stickers API. That was deprecated, and I don't know of a public replacement. | ❌ Not possible that I know of. Use copy/paste or share. |
| Your own custom keyboard | Build a full keyboard extension (iOS) or IME (Android) that inserts images through `commitContent` | ❌ Big project. It only helps users who switch to your keyboard. |

## WhatsApp pack requirements (the backend already meets them)

- 3–30 stickers per pack
- each sticker 512×512 WebP; static ≤ 100 KB, animated ≤ 500 KB → `lib/image.js` produces this, and `whatsappCompatible` records whether it fit
- a 96×96 PNG tray icon ≤ 50 KB → generated on the phone from the pack's first sticker
- Android: a `ContentProvider` exposing the pack metadata + files, then `Intent("com.whatsapp.intent.action.ENABLE_STICKER_PACK")` with `sticker_pack_id`, `sticker_pack_authority`, `sticker_pack_name`
- iOS: the pack JSON (base64 WebP data) on `UIPasteboard` under WhatsApp's type, then open `whatsapp://stickerPack`

The iOS side lives in `mobile/modules/pluck-native/ios/PluckNativeModule.swift` and follows WhatsApp's open-source sample (`github.com/WhatsApp/stickers`, `Interoperability.swift`): pack JSON on the pasteboard under `net.whatsapp.third-party.sticker-pack`, then open `whatsapp://stickerPack`. Stickers are re-encoded on the phone to 512×512 WebP ≤ 100 KB with a 16px margin, and the tray icon is a 96×96 PNG. Android still needs WhatsApp's `StickerContentProvider` ported.

## iMessage

Add an iMessage extension target (e.g. with `@bacons/apple-targets`) and a shared App Group. The app copies vault files into the group container (`syncIMessageStickers`), and the extension's `MSStickerBrowserViewController` lists them. The drawer then shows the user's live vault.
