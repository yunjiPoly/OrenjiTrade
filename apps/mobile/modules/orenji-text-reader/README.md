# OrenjiTextReader (local Expo module)

The card scan's text reader (owner spec `docs/product/specs/2026-10-15-card-scan.md`, section 3.3):
Apple Vision on iPhone (`VNRecognizeTextRequest`, accurate level, English), ML Kit text
recognition with its bundled Latin model on Android. It reads a still image file of the phone's
own storage and returns the lines it found with their boxes; no copy kept, no metadata read or
returned. The module itself makes no network call, and the photo and the text read never leave the
phone.

- **ML Kit's own metrics (Android).** Google's ML Kit SDK sends Google diagnostics and usage data
  of its own over HTTPS: device and app information, identifiers, performance metrics (such as
  latency), the API configuration (such as the image format and resolution), input and output
  sizes, event types and error codes. Google's "ML Kit data disclosure" page
  (developers.google.com/ml-kit/android-data-disclosure, read 2026-10-15) lists no image content
  and no recognised text among them, and describes no way to turn the metrics off. To record before
  an Android release: the Play data-safety form and the privacy policy must name them; when the
  owner tests on Android, watch the phone's traffic during a scan and check again whether they can
  be turned off. Apple Vision reads on the iPhone itself. The Android side could not be verified
  on this machine (no Android SDK).

- The contract (`recognize(uri, options)`) is written in
  `apps/mobile/src/features/scan/ocr/nativeTextReader.ts`; the app loads the module lazily by its
  name, `OrenjiTextReader`, so Expo Go, the web build and jest run without it (the scan is then
  unavailable).
- Scaffolded with `npx create-expo-module --local` (template of SDK 57) and linked by Expo's
  autolinking from `apps/mobile/modules`. It has no JavaScript of its own and no config plugin.
- Building it: `apps/mobile/README.md`, "The card scan's development build (simulator)".
