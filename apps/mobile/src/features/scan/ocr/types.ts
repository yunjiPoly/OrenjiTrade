/**
 * The card scan's reader seam (owner spec 2026-10-15, section 3.3): one interface, `OcrProvider`,
 * so readers can be swapped. Today there is one implementation on the device (Apple Vision on
 * iPhone, ML Kit on Android, through the local native module `OrenjiTextReader`: see
 * `deviceOcr.ts`) and a fake for tests (`fakeOcrProvider.ts`). No cloud reader: the photo never
 * leaves the phone.
 */

/** A still photo on the device: a local file and its size in pixels, upright. */
export interface OcrPhoto {
  /** A `file://` URI the app may read (a camera photo, or the picker's copy of a library photo). */
  uri: string;
  width: number;
  height: number;
}

/** A rectangle in photo pixels, origin at the top left of the upright photo. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A rectangle in fractions (0 to 1) of the image that was read, origin at its top left: the
 * cropped area for `recognizeName` and `recognizeSetCode`, the (turned) photo for
 * `recognizeLines`.
 */
export interface FractionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One line of text the engine found. */
export interface OcrLine {
  text: string;
  /** 0 to 1; null when the engine gives none (ML Kit gives none for lines on some versions). */
  confidence: number | null;
  box: FractionRect;
}

/** What one area of the photo holds. */
export interface OcrResult {
  /** The lines in reading order (top to bottom, then left to right), one per row of text. */
  text: string;
  /** The mean confidence of the lines that have one; null when none has one (or no line). */
  confidence: number | null;
  /** The raw lines, as the engine gave them. */
  lines: OcrLine[];
}

/** How far a photo is turned clockwise before it is read (library photos only, spec 3.3). */
export type OcrRotation = 0 | 90 | 180 | 270;

export interface RecognizeLinesOptions {
  rotation?: OcrRotation;
}

export interface OcrProvider {
  /** Reads the card's name area (`box`, photo pixels, margin included). */
  recognizeName(photo: OcrPhoto, box: PixelRect): Promise<OcrResult>;
  /**
   * Reads a set code area (`box`, photo pixels, margin included). The code is tiny: the
   * implementation reads the area at twice its size (`SET_CODE_READ_SCALE`) and without language
   * correction.
   */
  recognizeSetCode(photo: OcrPhoto, box: PixelRect): Promise<OcrResult>;
  /** Reads the whole photo, turned by `rotation`, and returns its lines with their boxes. */
  recognizeLines(photo: OcrPhoto, options?: RecognizeLinesOptions): Promise<OcrLine[]>;
}
