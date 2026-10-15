package expo.modules.orenjitextreader

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
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
 * metrics, no image content and no text (the module's README, "ML Kit's own metrics"). Android 9 and later decode it upright themselves (ImageDecoder); Android 7 and 8 decode
 * it as stored (BitmapFactory), and the scan's whole-photo turns cover a library photo stored
 * sideways.
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
    val image = decode(localUri(uri))
    val crop = options.crop
    val left: Int
    val top: Int
    val right: Int
    val bottom: Int
    if (crop == null) {
      left = 0
      top = 0
      right = image.width
      bottom = image.height
    } else {
      left = crop.x.roundToInt().coerceIn(0, image.width)
      top = crop.y.roundToInt().coerceIn(0, image.height)
      right = (crop.x + crop.width).roundToInt().coerceIn(0, image.width)
      bottom = (crop.y + crop.height).roundToInt().coerceIn(0, image.height)
    }
    if (right - left < 1 || bottom - top < 1) {
      image.recycle()
      throw EmptyCropException()
    }
    val width = right - left
    val height = bottom - top
    val scale = min(options.scale, MAX_SIDE / max(width, height).toDouble()).toFloat()
    val matrix = Matrix().apply {
      postScale(scale, scale)
      postRotate(options.rotation.toFloat())
    }
    val prepared = Bitmap.createBitmap(image, left, top, width, height, matrix, true)
    if (prepared !== image) {
      image.recycle()
    }
    return prepared
  }

  /** The image decoded in memory, upright on Android 9 and later. */
  private fun decode(uri: Uri): Bitmap {
    val context = appContext.reactContext ?: throw ImageNotReadableException(null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val source = if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
        ImageDecoder.createSource(context.contentResolver, uri)
      } else {
        ImageDecoder.createSource(File(requireNotNull(uri.path)))
      }
      // ImageDecoder applies the file's orientation itself; software pixels, for createBitmap.
      return ImageDecoder.decodeBitmap(source) { decoder, _, _ ->
        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
      }
    }
    val stream: InputStream? = if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
      context.contentResolver.openInputStream(uri)
    } else {
      File(requireNotNull(uri.path)).inputStream()
    }
    return stream?.use { BitmapFactory.decodeStream(it) } ?: throw ImageNotReadableException(null)
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
