import type { OcrRotation, PixelRect } from './types';

/**
 * The contract of the local native module the card scan reads text with (spec 3.3). It is NOT
 * built yet: a later batch adds it as a local Expo module (`npx create-expo-module --local`) in
 * `apps/mobile/modules/orenji-text-reader`, registered under the name below, once the owner's
 * "install OrenjiTrade on my phone as a real app" task allows local native builds. Until then (and
 * always in Expo Go, on the web and in jest) the module is missing and the scan is unavailable.
 *
 * - iOS: Apple Vision, `VNRecognizeTextRequest` at the accurate level; language correction as asked
 *   (off for the set code).
 * - Android: ML Kit text recognition with the bundled Latin model (offline from the first scan).
 * - The image is decoded upright; nothing of its metadata is returned. The photo never leaves the
 *   phone and the module keeps no copy of it.
 */
export const NATIVE_TEXT_READER_MODULE = 'OrenjiTextReader';

export interface NativeRecognizeOptions {
  /** The part of the upright photo to read, in photo pixels; the whole photo when absent. */
  crop?: PixelRect | null;
  /** Enlarges the (cropped) image before reading it: 2 for the set code, 1 otherwise. */
  scale?: number;
  /** Turns the image clockwise before reading it (after the crop). */
  rotation?: OcrRotation;
  /** iOS only: Vision's language correction (off for the set code). Android ignores it. */
  languageCorrection?: boolean;
}

/** One line as the module returns it (checked again by `sanitizeLines`). */
export interface NativeLine {
  text: string;
  /** 0 to 1, or null when the engine gives none. */
  confidence: number | null;
  /** Fractions (0 to 1) of the image read (after crop, scale and rotation), origin top left. */
  box: { x: number; y: number; width: number; height: number };
}

export interface NativeRecognizeResult {
  lines: NativeLine[];
}

export interface NativeTextReaderModule {
  /** Reads the text of a local image file (`file://`). Rejects when the file cannot be read. */
  recognize(uri: string, options: NativeRecognizeOptions): Promise<NativeRecognizeResult>;
}
