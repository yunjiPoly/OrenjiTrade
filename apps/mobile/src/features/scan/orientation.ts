import type { FractionRect, OcrLine, OcrRotation } from './ocr/types';
import { holdsCode, holdsPasscode } from './textPicking';

/**
 * Which way up a card was read (owner spec 2026-10-15, section 3.3, library photos), judged from
 * the boxes of the lines the reader found. Pure.
 *
 * Apple Vision reads a sideways or upside-down card in place: its text comes back right, but its
 * lines are tall boxes (sideways) or in reverse order (upside down), so the name is not the top
 * row. The judgement uses two marks every card has:
 *
 * - the passcode, at the bottom left: the card's top is on the side of it where the other lines
 *   lie;
 * - when no passcode was read, the set code, under the artwork: the card's top is on the side of it
 *   where fewer lines lie (the name above it, the type line, the text and the stats below).
 *
 * A side counts when it holds at least {@link CLEAR_LEAD} more lines than the other; otherwise the
 * read gives no judgement (null), and the scan reads it as upright.
 */

/** Lines with fewer letters and digits than this are left out: stars, marks, the icon's letters. */
const MIN_CHARACTERS = 4;

/** How many more lines one side of a mark must hold for the judgement to count. */
export const CLEAR_LEAD = 2;

/** A size in pixels. */
export interface ImageSize {
  width: number;
  height: number;
}

/** The size of a photo after a clockwise turn. */
export function sizeAfterTurn(photo: ImageSize, rotation: OcrRotation): ImageSize {
  return rotation === 90 || rotation === 270
    ? { width: photo.height, height: photo.width }
    : { width: photo.width, height: photo.height };
}

function characters(text: string): number {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/**
 * Whether the text of a read runs up and down: most of its letters sit in boxes taller than wide
 * (in pixels of the image read, `size`).
 */
function runsSideways(lines: readonly OcrLine[], size: ImageSize): boolean {
  let tall = 0;
  let wide = 0;
  for (const line of lines) {
    const count = characters(line.text);
    if (count < MIN_CHARACTERS) {
      continue;
    }
    if (line.box.height * size.height > line.box.width * size.width) {
      tall += count;
    } else {
      wide += count;
    }
  }
  return tall > wide;
}

type Axis = 'x' | 'y';

function start(box: FractionRect, axis: Axis): number {
  return axis === 'y' ? box.y : box.x;
}

function extent(box: FractionRect, axis: Axis): number {
  return axis === 'y' ? box.height : box.width;
}

/**
 * The lines lying wholly after a mark along the axis (below it, or to its right) minus those lying
 * wholly before it; the lines level with it (the copyright beside the passcode) do not count.
 */
function leadAfter(lines: readonly OcrLine[], mark: OcrLine, axis: Axis): number {
  const from = start(mark.box, axis);
  const to = from + extent(mark.box, axis);
  let before = 0;
  let after = 0;
  for (const line of lines) {
    if (line === mark || characters(line.text) < MIN_CHARACTERS) {
      continue;
    }
    const centre = start(line.box, axis) + extent(line.box, axis) / 2;
    if (centre < from) {
      before += 1;
    } else if (centre > to) {
      after += 1;
    }
  }
  return after - before;
}

/**
 * The side of the card's top along the axis (-1: top or left, 1: bottom or right), from the first
 * mark with a clear lead: on the side holding more lines (`topWhereMore`) or fewer.
 */
function topSide(
  lines: readonly OcrLine[],
  marks: readonly OcrLine[],
  axis: Axis,
  topWhereMore: boolean
): -1 | 1 | null {
  for (const mark of marks) {
    const lead = leadAfter(lines, mark, axis);
    if (Math.abs(lead) >= CLEAR_LEAD) {
      const more = lead > 0 ? 1 : -1;
      return topWhereMore ? more : more === 1 ? -1 : 1;
    }
  }
  return null;
}

/**
 * The clockwise turn that would bring the card of a read upright: 0 when it is, 180 when it is
 * upside down, 90 or 270 when it lies on its side (its top on the left, or on the right); null
 * when its lines do not tell (no passcode and no code with a clear lead). `size` is the size in
 * pixels of the image read.
 */
export function uprightTurn(lines: readonly OcrLine[], size: ImageSize): OcrRotation | null {
  const axis: Axis = runsSideways(lines, size) ? 'x' : 'y';
  const top =
    topSide(
      lines,
      lines.filter((line) => holdsPasscode(line.text)),
      axis,
      true
    ) ??
    topSide(
      lines,
      lines.filter((line) => holdsCode(line.text)),
      axis,
      false
    );
  if (top === null) {
    return null;
  }
  if (axis === 'y') {
    return top === -1 ? 0 : 180;
  }
  return top === -1 ? 90 : 270;
}

/** A box of an image as it lies once the image is turned clockwise by `rotation`. */
export function turnBox(box: FractionRect, rotation: OcrRotation): FractionRect {
  switch (rotation) {
    case 90:
      return { x: 1 - (box.y + box.height), y: box.x, width: box.height, height: box.width };
    case 180:
      return {
        x: 1 - (box.x + box.width),
        y: 1 - (box.y + box.height),
        width: box.width,
        height: box.height,
      };
    case 270:
      return { x: box.y, y: 1 - (box.x + box.width), width: box.height, height: box.width };
    default:
      return box;
  }
}

/**
 * The lines of a read as they would lie in the image turned clockwise by `rotation`: the same text,
 * boxes turned, so a sideways or upside-down read can be picked top row first without reading the
 * photo again.
 */
export function turnLines(lines: readonly OcrLine[], rotation: OcrRotation): OcrLine[] {
  return rotation === 0
    ? lines.slice()
    : lines.map((line) => ({ ...line, box: turnBox(line.box, rotation) }));
}
