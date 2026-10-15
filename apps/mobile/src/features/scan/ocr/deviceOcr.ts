import { requireOptionalNativeModule } from 'expo';

import { NAME_READ_SCALE, SET_CODE_READ_SCALE } from '../cardAreas';
import { ocrResultOf, sanitizeLines } from './lines';
import {
  NATIVE_TEXT_READER_MODULE,
  type NativeRecognizeOptions,
  type NativeTextReaderModule,
} from './nativeTextReader';
import type { OcrLine, OcrPhoto, OcrProvider, PixelRect } from './types';

/**
 * The reader on the device: Apple Vision on iPhone, ML Kit on Android, through the local native
 * module `OrenjiTextReader` (`nativeTextReader.ts`). The module is looked up lazily, the first time
 * the scan asks for it, and a missing module means "the scan is unavailable": Expo Go, the web (see
 * `deviceOcr.web.ts`), jest, and every build made before the native batch.
 */

export type NativeTextReaderLoader = () => NativeTextReaderModule | null;

function isReaderModule(value: unknown): value is NativeTextReaderModule {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { recognize?: unknown }).recognize === 'function'
  );
}

/** Expo's module registry: a native module by its name, or null when the build has none. */
export type NativeModuleLookup = (name: string) => unknown;

/**
 * A loader that asks `lookup` for the module `OrenjiTextReader` when it is called (never before):
 * null when the build has none, when the lookup fails, or when what it finds cannot read.
 */
export function nativeTextReaderLoader(
  lookup: NativeModuleLookup = requireOptionalNativeModule
): NativeTextReaderLoader {
  return () => {
    try {
      const module: unknown = lookup(NATIVE_TEXT_READER_MODULE);
      return isReaderModule(module) ? module : null;
    } catch {
      return null;
    }
  };
}

/** The device's module, looked up in Expo's registry. */
export const loadNativeTextReader: NativeTextReaderLoader = nativeTextReaderLoader();

async function recognize(
  native: NativeTextReaderModule,
  photo: OcrPhoto,
  options: NativeRecognizeOptions
): Promise<OcrLine[]> {
  const answer: unknown = await native.recognize(photo.uri, options);
  return sanitizeLines((answer as { lines?: unknown } | null)?.lines);
}

/** An `OcrProvider` over a native reader module (the module of a test, or the device's). */
export function createDeviceOcrProvider(native: NativeTextReaderModule): OcrProvider {
  const area = async (photo: OcrPhoto, box: PixelRect, options: NativeRecognizeOptions) =>
    ocrResultOf(await recognize(native, photo, { crop: box, rotation: 0, ...options }));
  return {
    recognizeName: (photo, box) =>
      area(photo, box, { scale: NAME_READ_SCALE, languageCorrection: true }),
    recognizeSetCode: (photo, box) =>
      area(photo, box, { scale: SET_CODE_READ_SCALE, languageCorrection: false }),
    recognizeLines: (photo, options) =>
      recognize(native, photo, {
        crop: null,
        scale: 1,
        rotation: options?.rotation ?? 0,
        languageCorrection: true,
      }),
  };
}

let cached: { provider: OcrProvider | null } | null = null;

/**
 * The device's reader, or null when this build has no native reader. The lookup is made once;
 * `loader` replaces the registry lookup (tests).
 */
export function getDeviceOcrProvider(
  loader: NativeTextReaderLoader = loadNativeTextReader
): OcrProvider | null {
  if (!cached) {
    const native = loader();
    cached = { provider: native ? createDeviceOcrProvider(native) : null };
  }
  return cached.provider;
}

/** Whether this build can read cards (the scan rows of "Add cards" show only then). */
export function isDeviceOcrAvailable(
  loader: NativeTextReaderLoader = loadNativeTextReader
): boolean {
  return getDeviceOcrProvider(loader) !== null;
}

/** Forgets the lookup (tests). */
export function resetDeviceOcrProvider(): void {
  cached = null;
}
