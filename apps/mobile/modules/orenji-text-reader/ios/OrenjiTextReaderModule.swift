import ExpoModulesCore
import UIKit
import Vision

/// The card scan's text reader on iPhone (owner spec 2026-10-15, section 3.3). Its contract is
/// `apps/mobile/src/features/scan/ocr/nativeTextReader.ts`:
///
/// - `recognize(uri, options)` reads a still image file of the phone's own storage (`file://` or an
///   absolute path; nothing else, never the network), optionally a crop of it (photo pixels of the
///   upright image), enlarged by `scale` and turned clockwise by `rotation`, with Apple Vision
///   (`VNRecognizeTextRequest`, accurate level, English, language correction as asked).
/// - It answers `{ lines: [{ text, confidence, box }] }`, each box in fractions (0 to 1) of the image
///   read (after crop, scale and rotation), origin at its top left.
///
/// Privacy: the image is decoded upright by UIKit and drawn into memory; no metadata of the file is
/// read or returned, no copy is written, and nothing leaves the phone.
public class OrenjiTextReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OrenjiTextReader")

    AsyncFunction("recognize") { (uri: String, options: RecognizeOptions) throws -> [String: Any] in
      let image = try TextReaderImage.prepare(uri: uri, options: options)
      let lines = try TextReaderVision.lines(in: image, languageCorrection: options.languageCorrection)
      return ["lines": lines]
    }
  }
}

/// The part of the upright photo to read, in photo pixels.
internal struct CropRect: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 0
  @Field var height: Double = 0
}

/// `NativeRecognizeOptions` of the contract.
internal struct RecognizeOptions: Record {
  @Field var crop: CropRect? = nil
  @Field var scale: Double = 1
  @Field var rotation: Int = 0
  @Field var languageCorrection: Bool = true
}

/// Turns a local image file into the bitmap Vision reads: upright, cropped, enlarged, turned.
internal enum TextReaderImage {
  /// The longest side of the image handed to Vision: a larger crop or photo is read smaller.
  static let maxSide: CGFloat = 4096

  static func prepare(uri: String, options: RecognizeOptions) throws -> CGImage {
    guard let path = localPath(of: uri) else {
      throw NotALocalImageException()
    }
    // UIImage applies the file's orientation when it draws: the pixels below are upright.
    guard let image = UIImage(contentsOfFile: path) else {
      throw ImageNotReadableException()
    }
    let width = image.size.width * image.scale
    let height = image.size.height * image.scale
    guard width >= 1, height >= 1 else {
      throw ImageNotReadableException()
    }
    let whole = CGRect(x: 0, y: 0, width: width, height: height)
    var crop = whole
    if let area = options.crop {
      crop = CGRect(x: area.x, y: area.y, width: area.width, height: area.height)
        .intersection(whole)
      guard !crop.isNull, crop.width >= 1, crop.height >= 1 else {
        throw EmptyCropException()
      }
    }
    guard [0, 90, 180, 270].contains(options.rotation) else {
      throw InvalidRotationException()
    }
    guard options.scale.isFinite, options.scale > 0 else {
      throw InvalidScaleException()
    }
    let scale = min(CGFloat(options.scale), maxSide / max(crop.width, crop.height))
    let scaledWidth = max(1, (crop.width * scale).rounded())
    let scaledHeight = max(1, (crop.height * scale).rounded())
    let sideways = options.rotation == 90 || options.rotation == 270
    let size = sideways
      ? CGSize(width: scaledHeight, height: scaledWidth)
      : CGSize(width: scaledWidth, height: scaledHeight)

    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let rendered = UIGraphicsImageRenderer(size: size, format: format).image { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: size))
      let cg = context.cgContext
      cg.interpolationQuality = .high
      // UIKit's context has its origin at the top left and y going down: a positive angle turns
      // the picture clockwise.
      cg.translateBy(x: size.width / 2, y: size.height / 2)
      cg.rotate(by: CGFloat(options.rotation) * .pi / 180)
      cg.translateBy(x: -scaledWidth / 2, y: -scaledHeight / 2)
      cg.scaleBy(x: scaledWidth / crop.width, y: scaledHeight / crop.height)
      cg.translateBy(x: -crop.minX, y: -crop.minY)
      image.draw(in: whole)
    }
    guard let cgImage = rendered.cgImage else {
      throw ImageNotReadableException()
    }
    return cgImage
  }

  /// The path of a `file://` URL or an absolute path; nil for anything else.
  static func localPath(of uri: String) -> String? {
    if uri.hasPrefix("/") {
      return uri
    }
    guard let url = URL(string: uri), url.isFileURL else {
      return nil
    }
    return url.path
  }
}

/// Apple Vision's text recognition on one bitmap.
internal enum TextReaderVision {
  static func lines(in image: CGImage, languageCorrection: Bool) throws -> [[String: Any]] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.automaticallyDetectsLanguage = false
    request.usesLanguageCorrection = languageCorrection
    let handler = VNImageRequestHandler(cgImage: image, orientation: .up, options: [:])
    do {
      try handler.perform([request])
    } catch {
      throw RecognitionFailedException()
    }
    return (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else {
        return nil
      }
      // Vision's boxes are normalised with their origin at the bottom left.
      let box = observation.boundingBox
      let x = clamp(box.minX)
      let y = clamp(1 - box.maxY)
      return [
        "text": candidate.string,
        "confidence": Double(candidate.confidence),
        "box": [
          "x": x,
          "y": y,
          "width": clamp(box.maxX) - x,
          "height": clamp(1 - box.minY) - y,
        ],
      ]
    }
  }

  private static func clamp(_ value: CGFloat) -> Double {
    Double(min(1, max(0, value)))
  }
}

internal final class NotALocalImageException: Exception, @unchecked Sendable {
  override var reason: String {
    "The text reader reads a local image file (file://) only"
  }
}

internal final class ImageNotReadableException: Exception, @unchecked Sendable {
  override var reason: String {
    "The image file could not be read"
  }
}

internal final class EmptyCropException: Exception, @unchecked Sendable {
  override var reason: String {
    "The crop holds no part of the image"
  }
}

internal final class InvalidRotationException: Exception, @unchecked Sendable {
  override var reason: String {
    "The rotation must be 0, 90, 180 or 270"
  }
}

internal final class InvalidScaleException: Exception, @unchecked Sendable {
  override var reason: String {
    "The scale must be a positive number"
  }
}

internal final class RecognitionFailedException: Exception, @unchecked Sendable {
  override var reason: String {
    "The text could not be read"
  }
}
