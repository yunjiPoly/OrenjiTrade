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
 *   lie, when that side holds at least {@link CLEAR_LEAD} more lines than the other;
 * - when no passcode was read, the set code, right under the artwork: the artwork is the card's
 *   widest stretch without text, so the card's top is on the side of the code where a gap of at
 *   least {@link ARTWORK_GAP} times the code's own length lies between the lines read, and on no
 *   side when such a gap lies on both or on neither. Counting the lines on each side does not
 *   tell: a Pendulum card's pendulum text, or a Spell's or Trap's short text, puts more lines
 *   above the code than below it, and a read without the name has none above it at all.
 *
 * Without a judgement (null) the scan reads the card as upright.
 */

/** Lines with fewer letters and digits than this are left out: stars, marks, the icon's letters. */
const MIN_CHARACTERS = 4;

/** How many more lines one side of the passcode must hold for the judgement to count. */
export const CLEAR_LEAD = 2;

/**
 * How many times the set code's length (its box along its text) a gap between lines must reach to
 * be the artwork. On the 31 whole-photo reads of fictional cards on the simulator (batch B1), the
 * artwork measured 3.1 to 5.8 code lengths and every other gap at most 1.5 (a short old code,
 * ZOB-005, above a text box read empty).
 */
export const ARTWORK_GAP = 2.5;

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

function counted(line: OcrLine): boolean {
  return characters(line.text) >= MIN_CHARACTERS;
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
    if (line === mark || !counted(line)) {
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
 * The side of the card's top along the axis (-1: top or left, 1: bottom or right) seen from the
 * passcode: the side holding the other lines, by a clear lead.
 */
function topSeenFromPasscode(
  passcode: OcrLine,
  lines: readonly OcrLine[],
  axis: Axis
): -1 | 1 | null {
  const lead = leadAfter(lines, passcode, axis);
  if (Math.abs(lead) < CLEAR_LEAD) {
    return null;
  }
  return lead > 0 ? 1 : -1;
}

/**
 * The side of the card's top along the axis (-1: top or left, 1: bottom or right) seen from the
 * set code: the side of the artwork, the only gap between the lines read that is at least
 * {@link ARTWORK_GAP} code lengths long (in pixels of the image read, `size`).
 */
function topSeenFromCode(
  code: OcrLine,
  lines: readonly OcrLine[],
  axis: Axis,
  size: ImageSize
): -1 | 1 | null {
  const along = axis === 'y' ? size.height : size.width;
  const length = axis === 'y' ? code.box.width * size.width : code.box.height * size.height;
  const codeFrom = start(code.box, axis);
  const codeTo = codeFrom + extent(code.box, axis);
  const spans = lines
    .filter((line) => line === code || counted(line))
    .map((line) => ({
      from: start(line.box, axis),
      to: start(line.box, axis) + extent(line.box, axis),
    }))
    .sort((a, b) => a.from - b.from);
  let before = false;
  let after = false;
  let reached = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    if (
      reached !== Number.NEGATIVE_INFINITY &&
      (span.from - reached) * along >= ARTWORK_GAP * length
    ) {
      if (span.from <= codeFrom) {
        before = true;
      } else if (reached >= codeTo) {
        after = true;
      }
    }
    reached = Math.max(reached, span.to);
  }
  if (before === after) {
    return null;
  }
  return before ? -1 : 1;
}

/** The first judgement of the marks, in order. */
function firstJudgement(
  marks: readonly OcrLine[],
  judge: (mark: OcrLine) => -1 | 1 | null
): -1 | 1 | null {
  for (const mark of marks) {
    const top = judge(mark);
    if (top !== null) {
      return top;
    }
  }
  return null;
}

/**
 * The clockwise turn that would bring the card of a read upright: 0 when it is, 180 when it is
 * upside down, 90 or 270 when it lies on its side (its top on the left, or on the right); null
 * when its lines do not tell (no passcode with a clear lead, no code with the artwork on one side).
 * `size` is the size in pixels of the image read.
 */
export function uprightTurn(lines: readonly OcrLine[], size: ImageSize): OcrRotation | null {
  const axis: Axis = runsSideways(lines, size) ? 'x' : 'y';
  const top =
    firstJudgement(
      lines.filter((line) => holdsPasscode(line.text)),
      (passcode) => topSeenFromPasscode(passcode, lines, axis)
    ) ??
    firstJudgement(
      lines.filter((line) => holdsCode(line.text)),
      (code) => topSeenFromCode(code, lines, axis, size)
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
