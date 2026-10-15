/**
 * DEVELOPMENT ONLY. REMOVE BEFORE THE PR (card scan batch B1, owner spec 2026-10-15, section 9,
 * step 1: "a bare test screen (removed before the PR)").
 *
 * The reader's test bench: picks library photos and reads each one twice through the native
 * reader (`OrenjiTextReader`), as the scan will:
 *
 * - "camera path": the Name and set code areas (and the Pendulum spot when the first spot holds no
 *   code), placed with the mockup's camera frame (a 258 × 376 frame at 66, 80 of a 390 × 844
 *   preview, screen 27) and the preview's cover scaling (`cropsUnderFrame`); the whole photo
 *   after it when an area gave nothing;
 * - "library path": the whole photo, then turned 90°, 180° and 270° while no code is found.
 *
 * For each: the lines every reader call returned and its time, the code and name candidates of the
 * text picking, and the answer of `POST /cards/scan-match` with its time. Nothing of the photo
 * leaves the phone; the picker's copies are deleted once read. A summary of the reads (text only)
 * is written to the app's documents as `dev-reader-results.json` for the batch's report.
 * Reachable only in development builds (`__DEV__`), by its route: `orenjitrade://scan/dev-reader`.
 */
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { matchScannedCard } from '@/src/api/hooks/cardScan';
import { Button } from '@/src/components/ui/Button';
import { Screen } from '@/src/components/ui/Screen';
import { Text } from '@/src/components/ui/Text';
import { cropsUnderFrame, type CardCrops } from '@/src/features/scan/frameMapping';
import { getDeviceOcrProvider } from '@/src/features/scan/ocr/deviceOcr';
import type { OcrPhoto, OcrProvider, PixelRect } from '@/src/features/scan/ocr/types';
import { readCardText, type PhotoSource } from '@/src/features/scan/readCardText';
import type { CardScanMatch, ScanRead } from '@/src/features/scan/types';
import { LIBRARY_PHOTO_OPTIONS } from '@/src/lib/photoPicker';
import { spacing, useTheme } from '@/src/theme';

/** The camera screen of the mockup (screen 27): the preview fills a 390 × 844 screen. */
const MOCKUP_PREVIEW = { width: 390, height: 844 };
const MOCKUP_FRAME = { x: 66, y: 80, width: 258, height: 376 };

interface ReaderCall {
  step: string;
  ms: number;
  lines: { text: string; confidence: number | null }[];
}

interface PathResult {
  path: PhotoSource;
  calls: ReaderCall[];
  readMs: number;
  read: ScanRead | null;
  readError: string | null;
  matchMs: number | null;
  match: CardScanMatch | null;
  matchError: string | null;
}

interface PhotoResult {
  index: number;
  fileName: string;
  width: number;
  height: number;
  camera: PathResult | null;
  library: PathResult;
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function sameRect(a: PixelRect, b: PixelRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** The device reader, recording every call it answers. */
function recording(provider: OcrProvider, crops: CardCrops | null, calls: ReaderCall[]) {
  const record = async <T,>(
    step: string,
    call: () => Promise<T>,
    linesOf: (value: T) => ReaderCall['lines']
  ) => {
    const started = now();
    const value = await call();
    calls.push({ step, ms: Math.round(now() - started), lines: linesOf(value) });
    return value;
  };
  const recorded: OcrProvider = {
    recognizeName: (photo, box) =>
      record(
        'Name area',
        () => provider.recognizeName(photo, box),
        (result) => result.lines
      ),
    recognizeSetCode: (photo, box) =>
      record(
        crops && sameRect(box, crops.pendulumSetCode) ? 'Pendulum spot' : 'Set code area (x2)',
        () => provider.recognizeSetCode(photo, box),
        (result) => result.lines
      ),
    recognizeLines: (photo, options) =>
      record(
        `Whole photo ${options?.rotation ?? 0}°`,
        () => provider.recognizeLines(photo, options),
        (lines) => lines
      ),
  };
  return recorded;
}

async function runPath(
  provider: OcrProvider,
  photo: OcrPhoto,
  path: PhotoSource,
  crops: CardCrops | null
): Promise<PathResult> {
  const calls: ReaderCall[] = [];
  const result: PathResult = {
    path,
    calls,
    readMs: 0,
    read: null,
    readError: null,
    matchMs: null,
    match: null,
    matchError: null,
  };
  const started = now();
  try {
    result.read = await readCardText(recording(provider, crops, calls), {
      photo,
      source: path,
      crops,
    });
  } catch (error) {
    result.readError = error instanceof Error ? error.message : String(error);
  }
  result.readMs = Math.round(now() - started);
  if (result.read && (result.read.codes.length > 0 || result.read.names.length > 0)) {
    const matchStarted = now();
    try {
      result.match = await matchScannedCard(result.read);
    } catch (error) {
      result.matchError = error instanceof Error ? error.message : String(error);
    }
    result.matchMs = Math.round(now() - matchStarted);
  }
  return result;
}

function answerLine(result: PathResult): string {
  if (result.readError) {
    return `reader failed: ${result.readError}`;
  }
  if (!result.match) {
    return result.matchError ? `match failed: ${result.matchError}` : 'nothing read, no match';
  }
  const { match } = result;
  return [
    match.status + (match.reason ? ` ${match.reason}` : ''),
    match.card?.name ?? '-',
    match.printing ? `${match.printing.printingCode ?? '?'} ${match.printing.rarity ?? ''}` : '-',
    `rarities ${match.rarities.length}`,
    `printings ${match.printings.length}`,
    `others ${match.otherMatches.length}`,
  ].join(' · ');
}

function deletePickedCopy(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // The picker's copy is in the app's cache: the system clears it anyway.
  }
}

function saveSummary(results: PhotoResult[]) {
  try {
    const file = new File(Paths.document, 'dev-reader-results.json');
    if (file.exists) {
      file.delete();
    }
    file.create();
    file.write(JSON.stringify(results, null, 2));
  } catch {
    // The summary is for the batch report only.
  }
}

export default function DevReaderScreen() {
  const { palette } = useTheme();
  const [status, setStatus] = useState('Pick photos to read.');
  const [results, setResults] = useState<PhotoResult[]>([]);
  const [busy, setBusy] = useState(false);
  const provider = __DEV__ ? getDeviceOcrProvider() : null;

  if (!__DEV__) {
    return (
      <Screen>
        <Text>Development builds only.</Text>
      </Screen>
    );
  }

  const pick = async () => {
    if (!provider) {
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      ...LIBRARY_PHOTO_OPTIONS,
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 50,
    });
    if (picked.canceled || picked.assets.length === 0) {
      return;
    }
    setBusy(true);
    setResults([]);
    const done: PhotoResult[] = [];
    for (const [index, asset] of picked.assets.entries()) {
      setStatus(`Reading ${index + 1} of ${picked.assets.length}…`);
      const photo: OcrPhoto = { uri: asset.uri, width: asset.width, height: asset.height };
      const crops = cropsUnderFrame(MOCKUP_FRAME, MOCKUP_PREVIEW, photo);
      const camera = crops ? await runPath(provider, photo, 'CAMERA', crops) : null;
      const library = await runPath(provider, photo, 'LIBRARY', null);
      deletePickedCopy(asset.uri);
      done.push({
        index: index + 1,
        fileName: asset.fileName ?? `photo ${index + 1}`,
        width: asset.width,
        height: asset.height,
        camera,
        library,
      });
      setResults([...done]);
    }
    saveSummary(done);
    setStatus(`Done: ${done.length} of ${picked.assets.length} read.`);
    setBusy(false);
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'Reader test (dev)' }} />
      <Text testID="dev-reader-reader">
        {provider ? 'Native reader: OrenjiTextReader' : 'No native reader in this build.'}
      </Text>
      <Button
        label="Pick photos"
        onPress={pick}
        disabled={!provider}
        loading={busy}
        loadingLabel="Reading…"
        testID="dev-reader-pick"
        style={styles.button}
      />
      <Text testID="dev-reader-status">{status}</Text>
      {results.map((photo) => (
        <View
          key={photo.index}
          style={[styles.photo, { borderColor: palette.borderStrong }]}
          testID={`dev-reader-photo-${photo.index}`}
        >
          <Text style={styles.title}>
            {photo.index}. {photo.fileName} ({photo.width} × {photo.height})
          </Text>
          {[photo.camera, photo.library].map((result) =>
            result ? (
              <View key={result.path} style={styles.path}>
                <Text style={styles.title}>
                  {result.path === 'CAMERA' ? 'Camera path (areas)' : 'Library path (whole photo)'}
                  {` · read ${result.readMs} ms`}
                  {result.matchMs !== null ? ` · match ${result.matchMs} ms` : ''}
                </Text>
                {result.calls.map((call, position) => (
                  <Text key={position} style={{ color: palette.textMuted }}>
                    {call.step} ({call.ms} ms):{' '}
                    {call.lines.map((line) => line.text).join(' | ') || '(nothing)'}
                  </Text>
                ))}
                <Text>
                  Codes: {result.read?.codes.join(', ') || '(none)'} · Names:{' '}
                  {result.read?.names.join(', ') || '(none)'}
                </Text>
                <Text testID={`dev-reader-answer-${photo.index}-${result.path}`}>
                  Answer: {answerLine(result)}
                </Text>
              </View>
            ) : (
              <Text key="no-camera">Camera path: the frame cannot be placed on this photo.</Text>
            )
          )}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  button: { marginVertical: spacing[3] },
  photo: { borderWidth: 1, borderRadius: 8, padding: spacing[3], marginTop: spacing[3] },
  path: { marginTop: spacing[2] },
  title: { fontWeight: '600' },
});
