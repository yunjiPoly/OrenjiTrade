# ADR 0020 — The camera card scan reads text on the phone

**Status:** Accepted · **Date:** 2026-10-20 (decided 2026-10-14 and 2026-10-15) · **Relates to:**
[0014](0014-configurable-business-rules.md) (the flag is data), [0015](0015-card-images-provider-hosting-capped-cache.md)
(pictures), [0017](0017-platform-regions-instead-of-geolocation.md) (no places),
[0019](0019-free-for-all-no-paid-features.md) (free) · **Spec:**
[`docs/product/specs/2026-10-15-card-scan.md`](../../product/specs/2026-10-15-card-scan.md) (verbatim), mockup screens 26 to 30
· **Contract:** [`docs/api/contracts/card-scan.md`](../../api/contracts/card-scan.md)

## Context

Since 2026-09-29 the owner kept Phase 11 on hold: no ML card recognition, no camera → upload →
Pub/Sub → ML worker pipeline, `apps/ml` left as its Phase 0 skeleton, `mlScanning` off.

On 2026-10-14 the owner asked for "Scan with camera" for Yu-Gi-Oh! cards, built beside the phone
redesign: *"For now, dont need to detect the rarity, the art and the image. The feature is able to
read the card name and the printing set code and detect the card."* The owner lifted the ML hold
**for this on-device text scan only**. The owner's own plan was: take a photo, find the card,
straighten it, crop the Name and Set code areas, read them with PaddleOCR, normalise, match in the
database; never the 8-digit passcode; DINOv2 image matching maybe later.

On 2026-10-15 the owner chose *"the easiest way which finding the card by OCR reading the name and
set code"*, said it must be free, and added: *"no, no French cards. DONT detect french cards."*,
*"only Pendulum cards needs a second spot."* and *"it has to work on android too"*. The same day the
owner chose "simulator only for now" (no phone builds yet; Android later on the owner's own Android
phone), accepted ML Kit's anonymous usage metrics, and decided that an old European code read
without its dash **and** with a misread digit stays refused (the collector searches). On
2026-10-20 the owner ordered English cards only, with no French version (no French text, language
choice or French-code work).

## Decision

1. **The text is read on the phone, by the phone's own reader.** Apple Vision on iPhone
   (`VNRecognizeTextRequest`, accurate level, English; language correction off for the set code)
   and ML Kit text recognition on Android with its **bundled** Latin model
   (`com.google.mlkit:text-recognition:16.0.1`, offline from the first scan), through one local
   Expo module, `OrenjiTextReader` (`apps/mobile/modules/orenji-text-reader`, made with
   `npx create-expo-module --local`; no third-party JavaScript package). Not chosen:
   - **PaddleOCR or another model in Python:** the app cannot run Python, and a server would mean
     uploading every photo, paying for a machine and waiting on the network for each card;
   - **a paid or cloud OCR service:** it costs money per photo, needs an account and an upload, and
     the product is free (ADR 0019);
   - **a model of our own:** the hold stays for that; the phones' readers are free, offline and good
     at printed text.
   Expo SDK 57 has no text reader that runs in Expo Go (`expo-camera` reads barcodes only), so
   reading cards needs a local native build (point 8).
2. **What changed from the owner's plan.** Kept: the card is found from its name and its set code
   matched against our catalog; the two areas from the owner's coordinates, in one file
   (`src/features/scan/cardAreas.ts`); one reader interface, `OcrProvider`
   (`src/features/scan/ocr/types.ts`: the device reader and a fake for tests); look-alike
   characters swapped only when the catalog confirms the result; never the passcode; the set name
   from the catalog through the code; the rarity picked by the collector when a code comes in
   several. Changed: no card detection, perspective correction or preprocessing chain — the
   camera's card-shaped frame does the aligning, and a library photo is read whole (turned when its
   lines say so, its code band read again when no code was read). Added: the name and the code
   check each other in the catalog; Pendulum cards get a second spot for the code (no other card
   type does); English cards only.
3. **Matching on the server**, `POST /api/v1/cards/scan-match` (signed-in collectors only): the
   phone sends what it read (0 to 3 codes, 0 to 3 names, best first; a POST, so the text stays out
   of addresses) and the API decides with deterministic rules in `cards/domain/scan`, in at most
   six grouped queries. The rules sit behind one interface, **`CardMatcher`**: `TextCardMatcher`
   today; an image matcher (DINOv2) can implement it later behind the same endpoint — that is the
   seam the owner's plan asked for, and building it needs the owner to lift the hold further.
   **English cards only:** a code carrying another language's region (`MACR-FR036`, `LOB-F001`)
   answers NOT_FOUND (`OTHER_LANGUAGE`) whatever the name says, and other-language printings are
   never matched, listed or offered; a dashless read in doubt is settled by the catalog's sets, and
   the owner's refusal of a dashless read with a misread digit holds.
4. **Adding**, `POST /api/v1/inventory/items/batch`: the review list adds the ready cards in one
   transaction, with the owner lock and the lock order of every inventory write, the limit
   `inventory.items.max` checked for the whole batch (429 with nothing written), the listing
   reconciliation and the freshness confirmation. An optional `Idempotency-Key` (kept in Redis for
   24 hours, failing open) repeats the first answer of an add that went through. The phone keeps
   each add's key **with the exact body it sent** while that add has no answer (the **pending
   add**): adding again after a lost answer sends the same body under the same key, so nothing is
   added twice and nothing sent changes on the way (those cards and the pills stay as sent, "Not
   confirmed yet"); the other cards the same tap counted follow under a new key, and a card that
   became ready meanwhile waits for the next tap.
5. **Waiting and server errors.** A match with no answer within 20 s, or a 5xx, 408 or 429, leaves
   its tile "Waiting for connection" and is tried again: when the connection is back, after any
   match that got through, when a scan screen comes back, and on a timer (5, 10, 20, 40 s, then
   every minute) while a scan screen is open; any other refusal makes it "Couldn't read". A
   card whose match fails with a server error while the API answers the scan's other photos is
   given up after its second such failure (after its fifth server error in any case): "Couldn't
   match", with the search and "Try again".
6. **The flag `cardTextScan`** (migration V129, on by default, edited in `/admin` like every flag,
   ADR 0014): both endpoints answer 404 `FEATURE_DISABLED` while it is off, and Add cards shows the
   two scan rows only when it is on **and** the build has the reader (otherwise R2's "Coming later"
   row stays: Expo Go, the web, the flag off). `mlScanning` stays off and untouched; `apps/ml`,
   the photo upload and the Pub/Sub pipeline of Phase 11 stay unbuilt.
7. **Privacy.** The photos never leave the phone; only the text read goes to the API. Camera photos
   are taken with `exif: false`, the picker is asked for no EXIF, and the native module reads no
   metadata of the file. Every photo file the scan made or copied is deleted when the scan ends
   (cards added, or the scan left) and, for a scan lost when the app was closed, at the next start
   of the app (a journal of the files' local addresses, never the photos). The server never logs
   the text read (only the status and how many codes and names were read, without the caller);
   the scan sends no analytics event, so nothing read reaches analytics; neither response holds a
   place (ADR 0017). The search inside the scan asks `GET /cards/suggest` with what was read, in
   its query string, like any typed search. **ML Kit's own metrics** (Android): Google's SDK sends
   Google diagnostics and usage data of its own (device and app information, latency, image format
   and size, error codes; no image content and no text, by Google's ML Kit data disclosure); the
   owner accepted them on 2026-10-15, and the Play data-safety form and the privacy policy must
   name them before an Android release. Apple Vision reads on the iPhone itself.
8. **The development build.** `ORENJI_APP_VARIANT=scan` gives the scan's own app the id
   `com.orenjitrade.app.scan` and the name "OrenjiTrade Scan" (app.config.ts), so it installs beside
   the owner's app; without the variable nothing changes. iOS 27 stops an app built with Xcode 27
   at launch unless it adopts the scene life cycle, which Expo SDK 57's template does not: the
   variant applies `plugins/withIosSceneLifecycle.js` (Expo's `ExpoAppSceneDelegate`, as SDK 58's
   template does). For now the scan is built for the **iOS simulator only** (owner, 2026-10-15),
   locally and free: no EAS, no Apple account, no signing. Builds for a phone belong to the
   phone-install task. The module's Android half is written but was never compiled, built or run
   on this Mac (no Android SDK): **the Android run could not be verified**; the owner will try it
   on an Android phone.
9. **Defaults chosen for the owner** (spec section 10): the tray lives in memory (closing the app
   loses a scan that was not added; its photo files are deleted at the next start); up to 50
   library photos at a time; scanned cards are added Private and in no binder unless changed on the
   review, and copies go to the equal card already there (same printing, language, condition,
   edition, finish, visibility and binder); `cardTextScan` is on by default; at most 99 copies per
   tile.

## Consequences

- Scanning is free and offline on the phone; the API does one small request per photo and one per
  add. Expo Go, the web export and jest run without the reader: the module is looked up lazily
  (`requireOptionalNativeModule`) and a missing one means the scan is unavailable; the web has a
  `.web.ts` stub, and the jest suites drive the scan with a fake reader.
- Real cards, on the finished screens (2026-10-20, iPhone 17 simulator, the owner's 32 library
  photos, the real catalog imported offline from the stored snapshot): 28 found right away (14
  "Found", 14 "Pick rarity" at the right code), 2 after one quick pick (the right card, "Pick
  printing"), 0 matched to a wrong card, 2 not read (one card is missing from the catalog
  snapshot, one gave no code); about 1.3 s per photo, read one after another. The camera path
  cannot run on the simulator (it has no camera), so these numbers are library photos.
- An image matcher, card detection or preprocessing can come later behind `CardMatcher` and
  `OcrProvider` without changing the endpoints; each needs the owner's word (the hold).
- Before a phone release: the phone-install task's builds (signing, the scan app's own URL scheme
  and Google sign-in redirect), the Android run, and ML Kit's metrics in the Play data-safety form
  and the privacy policy.
