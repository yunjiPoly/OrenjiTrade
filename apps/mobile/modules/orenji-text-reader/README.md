# OrenjiTextReader (local Expo module)

The card scan's text reader (owner spec `docs/product/specs/2026-10-15-card-scan.md`, section 3.3):
Apple Vision on iPhone (`VNRecognizeTextRequest`, accurate level, English), ML Kit text
recognition with its bundled Latin model on Android. It reads a still image file of the phone's
own storage and returns the lines it found with their boxes; no network, no copy kept, no metadata
read or returned.

- The contract (`recognize(uri, options)`) is written in
  `apps/mobile/src/features/scan/ocr/nativeTextReader.ts`; the app loads the module lazily by its
  name, `OrenjiTextReader`, so Expo Go, the web build and jest run without it (the scan is then
  unavailable).
- Scaffolded with `npx create-expo-module --local` (template of SDK 57) and linked by Expo's
  autolinking from `apps/mobile/modules`. It has no JavaScript of its own and no config plugin.
- Building it: `apps/mobile/README.md`, "The card scan's development build (simulator)".
