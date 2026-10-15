import AppIntents
import Foundation

/// "Cut Sticker with Pluck" — a Shortcuts action.
/// Paired with "Take Screenshot" and bound to Back Tap, it gives:
/// double-tap the back of the iPhone -> Pluck opens on that screen -> tap the sticker.
///
/// It lives in the app target (not the Expo module) because Shortcuts only discovers
/// App Intents that are compiled into the app itself.
@available(iOS 16.0, *)
struct CutStickerIntent: AppIntent {
  static let title: LocalizedStringResource = "Cut Sticker with Pluck"
  static let description = IntentDescription("Opens Pluck on an image, ready for you to tap the sticker you want.")
  static let openAppWhenRun: Bool = true

  @Parameter(title: "Image", supportedTypeIdentifiers: ["public.image"], inputConnectionBehavior: .connectToPreviousIntentResult)
  var image: IntentFile

  @MainActor
  func perform() async throws -> some IntentResult {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("backtap-\(UUID().uuidString).png")
    try image.data.write(to: url)
    // Picked up by PluckNative.takePendingCapture(); the notification wakes JS if it's already running.
    UserDefaults.standard.set(url.absoluteString, forKey: "pluck.pendingCapture")
    NotificationCenter.default.post(name: Notification.Name("PluckPendingCapture"), object: nil)
    return .result()
  }
}
