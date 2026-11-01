import type { NativeTextReaderModule } from './nativeTextReader';
import type { OcrProvider } from './types';

/**
 * Web build: no text reader. A browser has neither Apple Vision nor ML Kit, and the scan never
 * sends a photo anywhere, so the scan is unavailable and "Add cards" keeps its "Coming later" row.
 * Same exports as `deviceOcr.ts`.
 */

export type NativeTextReaderLoader = () => NativeTextReaderModule | null;

export type NativeModuleLookup = (name: string) => unknown;

export function nativeTextReaderLoader(_lookup?: NativeModuleLookup): NativeTextReaderLoader {
  return () => null;
}

export const loadNativeTextReader: NativeTextReaderLoader = nativeTextReaderLoader();

export function createDeviceOcrProvider(_native: NativeTextReaderModule): OcrProvider {
  throw new Error('The web build has no text reader');
}

export function getDeviceOcrProvider(_loader?: NativeTextReaderLoader): OcrProvider | null {
  return null;
}

export function isDeviceOcrAvailable(_loader?: NativeTextReaderLoader): boolean {
  return false;
}

export function resetDeviceOcrProvider(): void {}
