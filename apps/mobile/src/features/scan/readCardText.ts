import type { CardCrops } from './frameMapping';
import type {
  FractionRect,
  OcrLine,
  OcrPhoto,
  OcrProvider,
  OcrRotation,
  PixelRect,
} from './ocr/types';
import { sizeAfterTurn, turnBox, turnLines, uprightTurn } from './orientation';
import {
  codeBand,
  codeCandidates,
  codeFragments,
  nameCandidatesFromArea,
  nameCandidatesFromPhoto,
} from './textPicking';
import type { ScanRead } from './types';

/**
 * Reading one photo (owner spec 2026-10-15, section 3.3), through any `OcrProvider`:
 *
 * - a camera photo whose frame could be placed on it: the Name area and the set code area (read at
 *   twice its size by the provider); when the set code area holds no code, the Pendulum spot; a
 *   Name area whose text starts at the crop's left edge (a name cut short: the card was not under
 *   the frame) or that the reader doubts (every line under `DOUBTFUL_NAME_CONFIDENCE`) gives no
 *   name;
 * - then, when the areas gave no name or no code, or for a library photo: the whole photo, its
 *   lines picked by shape and position;
 * - a whole-photo read is picked the way up its line boxes say (`uprightTurn`): Apple Vision reads
 *   a sideways or upside-down card in place, its lines then tall or in reverse order, and the
 *   name must come first, never a line of the card's text;
 * - a library photo whose read lacks a code or a name, or lies sideways or upside down, is read
 *   again turned: first the way its lines say, then 90°, 180° and 270°; the first turned read that
 *   holds both and stands upright is kept; otherwise the first read holding both, or the code of
 *   the first read holding one with the names of the first read holding some (camera photos are
 *   aligned by the frame: never turned);
 * - a library photo whose reads, turns included, hold no code is read once more where its code
 *   lies (`codeBand`: around a code cut short after its region, or right above the top of the
 *   card's text box at the right), like the camera's set code area: twice its size, without
 *   language correction, turned the way the read it was placed on stood;
 * - a whole-photo read that still ends without a code sends the code cut short after its region
 *   one of its reads held (`codeFragment`, "ZR04-EN"), decided after the turns so that a turned
 *   read can still find the whole code.
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

/**
 * Below this confidence on every line, a Name area's read is doubtful: the whole photo gives the
 * names instead (on the owner's real photos, Apple Vision gave 1 to most lines, 0.5 or 0.3 to the
 * ones it doubted).
 */
export const DOUBTFUL_NAME_CONFIDENCE = 0.5;

/** How close to the crop's left edge (a fraction of its width) a Name area's line is cut there. */
const AT_LEFT_EDGE = 0.01;

/**
 * One whole-photo read: what it gave, the turn its lines ask for (null: upright or unknown), its
 * code fragment (sent only when no read holds a code), the rotation the photo was read at and its
 * lines as if the card stood upright.
 */
interface WholeRead {
  read: ScanRead;
  turn: OcrRotation | null;
  fragments: string[];
  rotation: OcrRotation;
  upright: OcrLine[];
}

/** What lines give picked as if the card stood upright (`turn` applied to the boxes). */
function pickLines(
  lines: readonly OcrLine[],
  turn: OcrRotation | null
): Pick<WholeRead, 'read' | 'fragments' | 'upright'> {
  const upright = turn === null ? lines.slice() : turnLines(lines, turn);
  return {
    read: { codes: codeCandidates(upright), names: nameCandidatesFromPhoto(upright) },
    fragments: codeFragments(upright),
    upright,
  };
}

async function readTurned(
  provider: OcrProvider,
  photo: OcrPhoto,
  rotation: OcrRotation
): Promise<WholeRead> {
  const lines =
    rotation === 0
      ? await provider.recognizeLines(photo)
      : await provider.recognizeLines(photo, { rotation });
  const turn = uprightTurn(lines, sizeAfterTurn(photo, rotation));
  return { ...pickLines(lines, turn), turn: turn === 0 ? null : turn, rotation };
}

function complete(read: ScanRead): boolean {
  return read.codes.length > 0 && read.names.length > 0;
}

/** A read without a code takes the first code fragment of the reads made, if any. */
function withFragment(read: ScanRead, reads: readonly WholeRead[]): ScanRead {
  if (read.codes.length > 0) {
    return read;
  }
  const fragments = reads.find((made) => made.fragments.length > 0)?.fragments ?? [];
  return fragments.length > 0 ? { codes: fragments, names: read.names } : read;
}

/** The clockwise turn that brings the photo to the way `read`'s upright lines stand. */
function standing(read: WholeRead): OcrRotation {
  return ((read.rotation + (read.turn ?? 0)) % 360) as OcrRotation;
}

/** A box in fractions of the photo, in its pixels (inside it). */
function inPixels(box: FractionRect, photo: OcrPhoto): PixelRect {
  const x = Math.round(box.x * photo.width);
  const y = Math.round(box.y * photo.height);
  return {
    x,
    y,
    width: Math.min(photo.width, Math.round((box.x + box.width) * photo.width)) - x,
    height: Math.min(photo.height, Math.round((box.y + box.height) * photo.height)) - y,
  };
}

/**
 * The codes of the band where the set code lies (`codeBand`), placed on the first read that shows
 * one, read like the camera's set code area and turned the way that read stood; none when no read
 * shows a band.
 */
async function readCodeBand(
  provider: OcrProvider,
  photo: OcrPhoto,
  reads: readonly WholeRead[]
): Promise<string[]> {
  for (const read of reads) {
    const turn = standing(read);
    const band = codeBand(read.upright, sizeAfterTurn(photo, turn));
    if (!band) {
      continue;
    }
    const box = inPixels(turnBox(band, ((360 - turn) % 360) as OcrRotation), photo);
    if (box.width < 1 || box.height < 1) {
      return [];
    }
    const result =
      turn === 0
        ? await provider.recognizeSetCode(photo, box)
        : await provider.recognizeSetCode(photo, box, { rotation: turn });
    return codeCandidates(result.lines);
  }
  return [];
}

async function readWholePhoto(
  provider: OcrProvider,
  photo: OcrPhoto,
  source: PhotoSource
): Promise<ScanRead> {
  const first = await readTurned(provider, photo, 0);
  if (source !== 'LIBRARY' || (complete(first.read) && first.turn === null)) {
    return withFragment(first.read, [first]);
  }
  const reads = [first];
  const asked = first.turn;
  const turns = asked === null ? TURNS : [asked, ...TURNS.filter((turn) => turn !== asked)];
  for (const rotation of turns) {
    // Past the turn the lines asked for, a read that holds both is enough.
    if (rotation !== asked && reads.some((read) => complete(read.read))) {
      break;
    }
    const turned = await readTurned(provider, photo, rotation);
    if (complete(turned.read) && turned.turn === null) {
      return turned.read;
    }
    reads.push(turned);
  }
  const both = reads.find((read) => complete(read.read));
  if (both) {
    return both.read;
  }
  const names = reads.find((read) => read.read.names.length > 0)?.read.names ?? [];
  const codes =
    reads.find((read) => read.read.codes.length > 0)?.read.codes ??
    (await readCodeBand(provider, photo, reads));
  return withFragment({ codes, names }, reads);
}

/**
 * Whether a Name area holds a name cut short (a line starting at the crop's left edge: the card
 * was not under the frame) or one the reader doubts (every line under
 * `DOUBTFUL_NAME_CONFIDENCE`; a line without a confidence is not doubted).
 */
function cutOrDoubtful(lines: readonly OcrLine[]): boolean {
  return (
    lines.some((line) => line.box.x <= AT_LEFT_EDGE) ||
    (lines.length > 0 && lines.every((line) => (line.confidence ?? 1) < DOUBTFUL_NAME_CONFIDENCE))
  );
}

/** What the phone read on one card: its code and name candidates, best first (`ScanRead`). */
export async function readCardText(provider: OcrProvider, input: ReadCardInput): Promise<ScanRead> {
  const { photo, source, crops } = input;
  if (source === 'CAMERA' && crops) {
    const [nameArea, codeArea] = await Promise.all([
      provider.recognizeName(photo, crops.name),
      provider.recognizeSetCode(photo, crops.setCode),
    ]);
    const names = cutOrDoubtful(nameArea.lines) ? [] : nameCandidatesFromArea(nameArea.lines);
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
