import type { CardCrops } from './frameMapping';
import type { OcrPhoto, OcrProvider, OcrRotation } from './ocr/types';
import { codeCandidates, nameCandidatesFromArea, nameCandidatesFromPhoto } from './textPicking';
import type { ScanRead } from './types';

/**
 * Reading one photo (owner spec 2026-10-15, section 3.3), through any `OcrProvider`:
 *
 * - a camera photo whose frame could be placed on it: the Name area and the set code area (read at
 *   twice its size by the provider); when the set code area holds no code, the Pendulum spot;
 * - then, when the areas gave no name or no code, or for a library photo: the whole photo, its
 *   lines picked by shape and position;
 * - a library photo whose upright read holds no code is read again turned 90°, 180° and 270°, and
 *   the first turn that holds a code is kept (camera photos are aligned by the frame: never turned).
 *
 * A failure of the reader is passed on (the tile then says "Couldn't read").
 */

export type PhotoSource = 'CAMERA' | 'LIBRARY';

export interface ReadCardInput {
  photo: OcrPhoto;
  source: PhotoSource;
  /** A camera photo's crops under the frame (`cropsUnderFrame`); null or absent: read it whole. */
  crops?: CardCrops | null;
}

const TURNS: readonly Exclude<OcrRotation, 0>[] = [90, 180, 270];

async function readWholePhoto(
  provider: OcrProvider,
  photo: OcrPhoto,
  source: PhotoSource
): Promise<ScanRead> {
  const upright = await provider.recognizeLines(photo);
  const first: ScanRead = {
    codes: codeCandidates(upright),
    names: nameCandidatesFromPhoto(upright),
  };
  if (first.codes.length > 0 || source !== 'LIBRARY') {
    return first;
  }
  let named: ScanRead | null = first.names.length > 0 ? first : null;
  for (const rotation of TURNS) {
    const lines = await provider.recognizeLines(photo, { rotation });
    const turned: ScanRead = {
      codes: codeCandidates(lines),
      names: nameCandidatesFromPhoto(lines),
    };
    if (turned.codes.length > 0) {
      return turned;
    }
    named ??= turned.names.length > 0 ? turned : null;
  }
  return named ?? first;
}

/** What the phone read on one card: its code and name candidates, best first (`ScanRead`). */
export async function readCardText(provider: OcrProvider, input: ReadCardInput): Promise<ScanRead> {
  const { photo, source, crops } = input;
  if (source === 'CAMERA' && crops) {
    const [nameArea, codeArea] = await Promise.all([
      provider.recognizeName(photo, crops.name),
      provider.recognizeSetCode(photo, crops.setCode),
    ]);
    const names = nameCandidatesFromArea(nameArea.lines);
    let codes = codeCandidates(codeArea.lines);
    if (codes.length === 0) {
      codes = codeCandidates((await provider.recognizeSetCode(photo, crops.pendulumSetCode)).lines);
    }
    if (codes.length > 0 && names.length > 0) {
      return { codes, names };
    }
    const whole = await readWholePhoto(provider, photo, source);
    return {
      codes: codes.length > 0 ? codes : whole.codes,
      names: names.length > 0 ? names : whole.names,
    };
  }
  return readWholePhoto(provider, photo, source);
}
