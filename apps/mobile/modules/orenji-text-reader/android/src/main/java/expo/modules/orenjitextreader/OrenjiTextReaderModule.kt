package expo.modules.orenjitextreader

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.InputStream
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The card scan's text reader on Android (owner spec 2026-10-15, section 3.3). Its contract is
 * `apps/mobile/src/features/scan/ocr/nativeTextReader.ts`, the same as the iPhone's:
 *
 * - `recognize(uri, options)` reads a still image of the phone's own storage (`file://`, an
 *   absolute path or a `content://` of the device; never the network), optionally a crop of it
 *   (photo pixels of the upright image), enlarged by `scale` and turned clockwise by `rotation`,
 *   with ML Kit text recognition and its BUNDLED Latin model (offline from the first scan; the
 *   version is pinned in build.gradle). `languageCorrection` is iOS only and ignored here.
 * - It answers `{ lines: [{ text, confidence, box }] }`, each box in fractions (0 to 1) of the
 *   image read (after crop, scale and rotation), origin at its top left.
 *
 * Privacy: the image is decoded into memory and never written; no metadata of the file is read or
 * returned. This module makes no network call; ML Kit itself sends Google diagnostics and usage
 * metrics, no image content and no text (the module's README, "ML Kit's own metrics"), which the
 * owner accepted on 2026-10-15.
 *
 * Decoding: Android 9 and later decode the image upright (ImageDecoder), only the part read, and
 * already smaller when it is read smaller (a photo longer than 4096 pixels read whole), so a 50 to
 * 200 megapixel photo never sits whole in memory. Android 7 and 8 decode it as stored
 * (BitmapFactory), by a power of two smaller when it is read smaller, then cut the part read; the
 * scan's whole-photo turns cover a library photo stored sideways.
 */
class OrenjiTextReaderModule : Module() {
  private var recognizer: TextRecognizer? = null

  override fun definition() = ModuleDefinition {
    Name("OrenjiTextReader")

    AsyncFunction("recognize") { uri: String, options: RecognizeOptions, promise: Promise ->
      recognize(uri, options, promise)
    }

    OnDestroy {
      recognizer?.close()
      recognizer = null
    }
  }

  private fun textRecognizer(): TextRecognizer =
    recognizer ?: TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).also {
      recognizer = it
    }

  private fun recognize(uri: String, options: RecognizeOptions, promise: Promise) {
    val bitmap = try {
      prepare(uri, options)
    } catch (error: CodedException) {
      promise.reject(error)
      return
    } catch (error: Exception) {
      promise.reject(ImageNotReadableException(error))
      return
    } catch (error: OutOfMemoryError) {
      promise.reject(ImageNotReadableException(error))
      return
    }
    textRecognizer()
      .process(InputImage.fromBitmap(bitmap, 0))
      .addOnSuccessListener { text ->
        val lines = linesOf(text, bitmap.width, bitmap.height)
        bitmap.recycle()
        promise.resolve(mapOf("lines" to lines))
      }
      .addOnFailureListener { error ->
        bitmap.recycle()
        promise.reject(RecognitionFailedException(error))
      }
  }

  /** The bitmap ML Kit reads: upright, cropped, enlarged, turned. */
  private fun prepare(uri: String, options: RecognizeOptions): Bitmap {
    if (options.rotation !in listOf(0, 90, 180, 270)) {
      throw InvalidRotationException()
    }
    if (!options.scale.isFinite() || options.scale <= 0.0) {
      throw InvalidScaleException()
    }
    val part = decode(localUri(uri), options)
    val image = part.bitmap
    val scale = part.scale.toFloat()
    val matrix = Matrix().apply {
      postScale(scale, scale)
      postRotate(options.rotation.toFloat())
    }
    val prepared = Bitmap.createBitmap(image, 0, 0, image.width, image.height, matrix, true)
    if (prepared !== image) {
      image.recycle()
    }
    return prepared
  }

  /**
   * The part of an upright image of `width` × `height` pixels to read (all of it without a crop)
   * and the scale it is read at: `options.scale`, lowered so its longest side is at most
   * [MAX_SIDE] pixels.
   */
  private fun planOf(width: Int, height: Int, options: RecognizeOptions): Plan {
    val crop = options.crop
    val area = if (crop == null) {
      Rect(0, 0, width, height)
    } else {
      Rect(
        crop.x.roundToInt().coerceIn(0, width),
        crop.y.roundToInt().coerceIn(0, height),
        (crop.x + crop.width).roundToInt().coerceIn(0, width),
        (crop.y + crop.height).roundToInt().coerceIn(0, height)
      )
    }
    if (area.width() < 1 || area.height() < 1) {
      throw EmptyCropException()
    }
    return Plan(area, min(options.scale, MAX_SIDE / max(area.width(), area.height()).toDouble()))
  }

  /** The part read, decoded in memory (upright on Android 9 and later), and the scale left. */
  private fun decode(uri: Uri, options: RecognizeOptions): Part {
    val context = appContext.reactContext ?: throw ImageNotReadableException(null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val source = if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
        ImageDecoder.createSource(context.contentResolver, uri)
      } else {
        ImageDecoder.createSource(File(requireNotNull(uri.path)))
      }
      var plan: Plan? = null
      // ImageDecoder applies the file's orientation itself: the size it gives, the target size and
      // the crop are the upright image's. Software pixels, for createBitmap.
      val bitmap = ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        val width = info.size.width
        val height = info.size.height
        val planned = planOf(width, height, options)
        plan = planned
        // Smaller when read smaller; never larger (the matrix enlarges the part read).
        val shrink = min(1.0, planned.scale)
        val targetWidth = max(1, (width * shrink).roundToInt())
        val targetHeight = max(1, (height * shrink).roundToInt())
        if (targetWidth != width || targetHeight != height) {
          decoder.setTargetSize(targetWidth, targetHeight)
        }
        if (options.crop != null) {
          decoder.crop = scaled(
            planned.area,
            targetWidth / width.toDouble(),
            targetHeight / height.toDouble(),
            targetWidth,
            targetHeight
          )
        }
      }
      val planned = plan ?: throw ImageNotReadableException(null)
      return Part(bitmap, planned.scale * planned.longest() / max(bitmap.width, bitmap.height))
    }
    // Android 7 and 8: the size as stored, then the image by a power of two smaller when it is
    // read smaller, and the part read cut from it.
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open(context, uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw ImageNotReadableException(null)
    }
    val planned = planOf(bounds.outWidth, bounds.outHeight, options)
    var sample = 1
    while (planned.scale * sample * 2 <= 1.0) {
      sample *= 2
    }
    val sampled = BitmapFactory.Options().apply { inSampleSize = sample }
    val image = open(context, uri).use { BitmapFactory.decodeStream(it, null, sampled) }
      ?: throw ImageNotReadableException(null)
    val area = scaled(
      planned.area,
      image.width / bounds.outWidth.toDouble(),
      image.height / bounds.outHeight.toDouble(),
      image.width,
      image.height
    )
    val part = Bitmap.createBitmap(image, area.left, area.top, area.width(), area.height())
    if (part !== image) {
      image.recycle()
    }
    return Part(part, planned.scale * planned.longest() / max(part.width, part.height))
  }

  /** `rect` scaled, rounded outwards, inside `width` × `height` and never empty. */
  private fun scaled(rect: Rect, sx: Double, sy: Double, width: Int, height: Int): Rect {
    val left = floor(rect.left * sx).toInt().coerceIn(0, width - 1)
    val top = floor(rect.top * sy).toInt().coerceIn(0, height - 1)
    val right = ceil(rect.right * sx).toInt().coerceIn(left + 1, width)
    val bottom = ceil(rect.bottom * sy).toInt().coerceIn(top + 1, height)
    return Rect(left, top, right, bottom)
  }

  private fun open(context: Context, uri: Uri): InputStream {
    val stream = if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
      context.contentResolver.openInputStream(uri)
    } else {
      File(requireNotNull(uri.path)).inputStream()
    }
    return stream ?: throw ImageNotReadableException(null)
  }

  /** A `file://` or `content://` URI, or an absolute path; anything else is refused. */
  private fun localUri(uri: String): Uri {
    if (uri.startsWith("/")) {
      return Uri.fromFile(File(uri))
    }
    val parsed = Uri.parse(uri)
    return when (parsed.scheme) {
      ContentResolver.SCHEME_FILE, ContentResolver.SCHEME_CONTENT -> parsed
      else -> throw NotALocalImageException()
    }
  }

  private fun linesOf(text: Text, width: Int, height: Int): List<Map<String, Any?>> {
    if (width <= 0 || height <= 0) {
      return emptyList()
    }
    return text.textBlocks.flatMap { block -> block.lines }.mapNotNull { line ->
      val box = line.boundingBox ?: return@mapNotNull null
      val x = fraction(box.left, width)
      val y = fraction(box.top, height)
      val confidence = line.confidence.toDouble()
      mapOf(
        "text" to line.text,
        "confidence" to if (confidence.isFinite() && confidence in 0.0..1.0) confidence else null,
        "box" to mapOf(
          "x" to x,
          "y" to y,
          "width" to fraction(box.right, width) - x,
          "height" to fraction(box.bottom, height) - y
        )
      )
    }
  }

  private fun fraction(value: Int, size: Int): Double =
    (value.toDouble() / size).coerceIn(0.0, 1.0)

  /** The part of an upright image to read, in its pixels, and the scale it is read at. */
  private class Plan(val area: Rect, val scale: Double) {
    fun longest(): Int = max(area.width(), area.height())
  }

  /** The part read, decoded, and the scale still to apply to it. */
  private class Part(val bitmap: Bitmap, val scale: Double)

  private companion object {
    /** The longest side of the image handed to ML Kit: a larger crop or photo is read smaller. */
    const val MAX_SIDE = 4096.0
  }
}

/** The part of the upright photo to read, in photo pixels. */
class CropRect : Record {
  @Field
  var x: Double = 0.0

  @Field
  var y: Double = 0.0

  @Field
  var width: Double = 0.0

  @Field
  var height: Double = 0.0
}

/** `NativeRecognizeOptions` of the contract. */
class RecognizeOptions : Record {
  @Field
  var crop: CropRect? = null

  @Field
  var scale: Double = 1.0

  @Field
  var rotation: Int = 0

  /** iOS only (Vision's language correction); ML Kit has none. */
  @Field
  var languageCorrection: Boolean = true
}

internal class NotALocalImageException :
  CodedException("The text reader reads a local image file (file:// or content://) only")

internal class ImageNotReadableException(cause: Throwable?) :
  CodedException("The image file could not be read", cause)

internal class EmptyCropException :
  CodedException("The crop holds no part of the image")

internal class InvalidRotationException :
  CodedException("The rotation must be 0, 90, 180 or 270")

internal class InvalidScaleException :
  CodedException("The scale must be a positive number")

internal class RecognitionFailedException(cause: Throwable?) :
  CodedException("The text could not be read", cause)
