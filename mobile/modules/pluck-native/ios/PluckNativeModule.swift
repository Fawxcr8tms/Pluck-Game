import ExpoModulesCore
import SDWebImageWebPCoder
import UIKit
import Vision
import CoreImage

final class PluckError: Exception, @unchecked Sendable {
  private let message: String
  init(_ message: String) {
    self.message = message
    super.init()
  }
  override var reason: String { message }
}

/// Accepts "file:///…" (percent-encoded or not) and bare "/var/…" paths, as different pickers hand out both.
func localPath(_ uri: String) -> String? {
  if uri.hasPrefix("/") { return uri }
  if let url = URL(string: uri), url.isFileURL { return url.path }
  if uri.hasPrefix("file://") { return String(uri.dropFirst("file://".count)).removingPercentEncoding }
  return nil
}

public class PluckNativeModule: Module {
  private var captureObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("PluckNative")

    // Back Tap: the "Cut Sticker with Pluck" Shortcuts action (PluckAppIntents.swift) drops a file here.
    Events("onPendingCapture")

    OnStartObserving {
      self.captureObserver = NotificationCenter.default.addObserver(
        forName: Notification.Name("PluckPendingCapture"), object: nil, queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onPendingCapture", [:])
      }
    }

    OnStopObserving {
      if let observer = self.captureObserver { NotificationCenter.default.removeObserver(observer) }
      self.captureObserver = nil
    }

    Function("takePendingCapture") { () -> String? in
      let defaults = UserDefaults.standard
      let uri = defaults.string(forKey: "pluck.pendingCapture")
      defaults.removeObject(forKey: "pluck.pendingCapture")
      return uri
    }

    // Tap-to-cut-out. Returns a transparent PNG of the thing under the user's finger.
    AsyncFunction("liftSubject") { (uri: String, x: Double, y: Double) async throws -> String in
      guard #available(iOS 17.0, *) else {
        throw PluckError("Tap-to-cut-out needs iOS 17 or newer. Use the square crop instead.")
      }
      return try StickerCutter.lift(fileUri: uri, x: x, y: y)
    }

    AsyncFunction("isWhatsAppInstalled") { () async -> Bool in
      await MainActor.run { UIApplication.shared.canOpenURL(WhatsApp.url) }
    }

    // Builds a WhatsApp sticker pack and hands it to WhatsApp, which then asks the user to confirm.
    AsyncFunction("sendToWhatsApp") { (identifier: String, name: String, publisher: String, stickerUris: [String]) async throws in
      let payload = try WhatsApp.buildPayload(identifier: identifier, name: name, publisher: publisher, stickerUris: stickerUris)
      try await WhatsApp.send(payload)
    }
  }
}

// MARK: - Cut-out

@available(iOS 17.0, *)
enum StickerCutter {
  static func lift(fileUri: String, x: Double, y: Double) throws -> String {
    guard let path = localPath(fileUri), let source = UIImage(contentsOfFile: path) else {
      throw PluckError("Couldn't open that image.")
    }
    let full = try upright(source)

    // Look only at a window around the tap. On a busy screenshot (avatars, text, buttons)
    // this makes the sticker the obvious "subject" instead of the whole UI.
    let side = Double(min(full.width, full.height)) * 0.6
    let cx = x * Double(full.width), cy = y * Double(full.height)
    let window = CGRect(x: cx - side / 2, y: cy - side / 2, width: side, height: side)
      .intersection(CGRect(x: 0, y: 0, width: full.width, height: full.height)).integral
    guard let crop = full.cropping(to: window) else { throw PluckError("Tap inside the picture.") }
    let tapInCrop = CGPoint(x: (cx - window.minX) / window.width, y: (cy - window.minY) / window.height)

    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: crop, options: [:])
    try handler.perform([request])
    guard let result = request.results?.first, !result.allInstances.isEmpty else {
      throw PluckError("Couldn't find a sticker there. Try tapping right on it, or use the square crop.")
    }

    let instances = instanceNear(tapInCrop, in: result)
    let masked = try result.generateMaskedImage(ofInstances: instances, from: handler, croppingToInstancesExtent: true)
    let ciImage = CIImage(cvPixelBuffer: masked)
    guard let cg = CIContext().createCGImage(ciImage, from: ciImage.extent) else { throw PluckError("Cut-out failed.") }
    guard let png = UIImage(cgImage: cg).pngData() else { throw PluckError("Couldn't save the cut-out.") }

    let out = FileManager.default.temporaryDirectory.appendingPathComponent("cutout-\(UUID().uuidString).png")
    try png.write(to: out)
    return out.absoluteString
  }

  /// The instance label under the tap, searching outward a little because fingers are fat.
  private static func instanceNear(_ p: CGPoint, in result: VNInstanceMaskObservation) -> IndexSet {
    let mask = result.instanceMask
    CVPixelBufferLockBaseAddress(mask, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(mask, .readOnly) }
    let w = CVPixelBufferGetWidth(mask), h = CVPixelBufferGetHeight(mask)
    let rowBytes = CVPixelBufferGetBytesPerRow(mask)
    guard let base = CVPixelBufferGetBaseAddress(mask)?.assumingMemoryBound(to: UInt8.self) else { return result.allInstances }
    let px = Int(p.x * Double(w)), py = Int(p.y * Double(h))
    let radius = max(w, h) / 12
    var r = 0
    while r <= radius {
      for dy in stride(from: -r, through: r, by: max(1, r)) {
        for dx in stride(from: -r, through: r, by: max(1, r)) {
          let sx = min(w - 1, max(0, px + dx)), sy = min(h - 1, max(0, py + dy))
          let label = Int(base[sy * rowBytes + sx])
          if label != 0 { return IndexSet(integer: label) }
        }
      }
      r += max(1, radius / 6)
    }
    return result.allInstances
  }

  private static func upright(_ image: UIImage) throws -> CGImage {
    if image.imageOrientation == .up, let cg = image.cgImage { return cg }
    let format = UIGraphicsImageRendererFormat()
    format.scale = image.scale
    let redrawn = UIGraphicsImageRenderer(size: image.size, format: format).image { _ in image.draw(at: .zero) }
    guard let cg = redrawn.cgImage else { throw PluckError("Couldn't read that image.") }
    return cg
  }
}

// MARK: - WhatsApp

/// Mirrors WhatsApp's open-source iOS sample (github.com/WhatsApp/stickers, Interoperability.swift):
/// the pack goes on the pasteboard as JSON, then WhatsApp is opened and imports it after the user confirms.
enum WhatsApp {
  static let url = URL(string: "whatsapp://stickerPack")!
  static let pasteboardType = "net.whatsapp.third-party.sticker-pack"

  static let canvas: CGFloat = 512
  static let margin: CGFloat = 16      // WhatsApp's guidelines ask for a 16px margin
  static let maxStickerBytes = 100 * 1024
  static let maxTrayBytes = 50 * 1024

  static func buildPayload(identifier: String, name: String, publisher: String, stickerUris: [String]) throws -> Data {
    guard (3...30).contains(stickerUris.count) else {
      throw PluckError("WhatsApp packs need 3 to 30 stickers (this one has \(stickerUris.count)).")
    }
    let images = try stickerUris.map { uri -> UIImage in
      guard let path = localPath(uri), let img = UIImage(contentsOfFile: path) else { throw PluckError("A sticker file is missing.") }
      return img
    }
    let stickers = try images.map { img -> [String: Any] in
      ["image_data": try webp(fit(img, side: canvas, margin: margin)).base64EncodedString(), "emojis": ["😀"]]
    }
    guard let tray = fit(images[0], side: 96, margin: 4).pngData(), tray.count <= maxTrayBytes else {
      throw PluckError("Couldn't make the pack icon.")
    }
    let json: [String: Any] = [
      "identifier": identifier,
      "name": name,
      "publisher": publisher,
      "tray_image": tray.base64EncodedString(),
      "ios_app_store_link": "",
      "android_play_store_link": "",
      "animated_sticker_pack": false,
      "stickers": stickers,
    ]
    return try JSONSerialization.data(withJSONObject: json)
  }

  static func send(_ payload: Data) async throws {
    try await MainActor.run {
      guard UIApplication.shared.canOpenURL(url) else { throw PluckError("WhatsApp isn't installed on this iPhone.") }
      UIPasteboard.general.setItems(
        [[pasteboardType: payload]],
        options: [.localOnly: true, .expirationDate: Date(timeIntervalSinceNow: 60)]
      )
      UIApplication.shared.open(url)
    }
  }

  /// Aspect-fit onto a transparent square with a margin.
  static func fit(_ image: UIImage, side: CGFloat, margin: CGFloat) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    let box = side - margin * 2
    let k = min(box / image.size.width, box / image.size.height)
    // Comment stickers are small on screen; when blowing them up, sharpen so they don't look mushy.
    let source = k > 1.5 ? sharpened(image) : image
    return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { ctx in
      ctx.cgContext.interpolationQuality = .high
      let size = CGSize(width: image.size.width * k, height: image.size.height * k)
      source.draw(in: CGRect(x: (side - size.width) / 2, y: (side - size.height) / 2, width: size.width, height: size.height))
    }
  }

  static func sharpened(_ image: UIImage) -> UIImage {
    guard let input = CIImage(image: image),
          let filter = CIFilter(name: "CISharpenLuminance") else { return image }
    filter.setValue(input, forKey: kCIInputImageKey)
    filter.setValue(0.5, forKey: kCIInputSharpnessKey)
    guard let output = filter.outputImage,
          let cg = CIContext().createCGImage(output, from: input.extent) else { return image }
    return UIImage(cgImage: cg, scale: image.scale, orientation: .up)
  }

  /// WebP under WhatsApp's 100 KB static limit, stepping quality down until it fits.
  static func webp(_ image: UIImage) throws -> Data {
    for quality in [0.9, 0.75, 0.6, 0.45, 0.3] {
      if let data = SDImageWebPCoder.shared.encodedData(with: image, format: .webP, options: [.encodeCompressionQuality: quality]),
         data.count <= maxStickerBytes {
        return data
      }
    }
    throw PluckError("A sticker is too detailed to fit WhatsApp's 100 KB limit.")
  }
}
