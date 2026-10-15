import { requireOptionalNativeModule } from 'expo';

/**
 * iOS-only native helpers. `null` in Expo Go, on Android and on web, so callers must check.
 *
 *   liftSubject(fileUri, x, y) -> Promise<fileUri>   x/y are 0..1 from the image's top-left
 *   sendToWhatsApp(identifier, name, publisher, stickerUris[]) -> Promise<void>
 *   isWhatsAppInstalled() -> Promise<boolean>
 *   takePendingCapture() -> string | null       image handed over by the Back Tap shortcut
 *   addListener('onPendingCapture', cb)         fires when one arrives while the app is running
 */
export default requireOptionalNativeModule('PluckNative');
