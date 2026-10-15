import type { FractionRect, OcrLine, OcrResult } from './types';

/**
 * A row of text: the lines an engine returned side by side (Vision may cut one printed line in
 * two observations, "Ash Blossom &" and "Joyous Spring"), joined left to right.
 */
export interface OcrRow {
  text: string;
  confidence: number | null;
  box: FractionRect;
  lines: OcrLine[];
}

function meanConfidence(lines: readonly OcrLine[]): number | null {
  const known = lines
    .map((line) => line.confidence)
    .filter((value): value is number => value !== null);
  if (known.length === 0) {
    return null;
  }
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

function union(boxes: readonly FractionRect[]): FractionRect {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** How much two boxes overlap vertically, as a share of the shorter one (0 to 1). */
function verticalOverlap(a: FractionRect, b: FractionRect): number {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const shorter = Math.min(a.height, b.height);
  if (shorter <= 0) {
    return a.y === b.y ? 1 : 0;
  }
  return Math.max(0, overlap) / shorter;
}

/**
 * Groups lines into rows: a line joins the row it overlaps vertically by at least half of the
 * shorter height. Rows come top to bottom, their lines left to right.
 */
export function rowsOf(lines: readonly OcrLine[]): OcrRow[] {
  const byCentre = lines
    .filter((line) => line.text.trim().length > 0)
    .slice()
    .sort((a, b) => a.box.y + a.box.height / 2 - (b.box.y + b.box.height / 2));
  const groups: { box: FractionRect; lines: OcrLine[] }[] = [];
  for (const line of byCentre) {
    const row = groups.find((candidate) => verticalOverlap(candidate.box, line.box) >= 0.5);
    if (row) {
      row.lines.push(line);
      row.box = union([row.box, line.box]);
    } else {
      groups.push({ box: line.box, lines: [line] });
    }
  }
  return groups
    .sort((a, b) => a.box.y - b.box.y)
    .map((group) => {
      const ordered = group.lines.slice().sort((a, b) => a.box.x - b.box.x);
      return {
        text: ordered.map((line) => line.text.trim()).join(' '),
        confidence: meanConfidence(ordered),
        box: group.box,
        lines: ordered,
      };
    });
}

/** The `OcrResult` of an area from the lines the engine found in it. */
export function ocrResultOf(lines: readonly OcrLine[]): OcrResult {
  return {
    text: rowsOf(lines)
      .map((row) => row.text)
      .join('\n'),
    confidence: meanConfidence(lines),
    lines: lines.slice(),
  };
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** One side of a box kept inside 0..1 (left as given when it already is: no rounding noise). */
function insideImage<P extends 'x' | 'y', S extends 'width' | 'height'>(
  start: number,
  size: number,
  position: P,
  extent: S
): Record<P | S, number> {
  const length = Math.max(0, size);
  if (start >= 0 && start + length <= 1) {
    return { [position]: start, [extent]: length } as Record<P | S, number>;
  }
  const from = clamp01(start);
  return {
    [position]: from,
    [extent]: Math.max(0, clamp01(start + length) - from),
  } as Record<P | S, number>;
}

/**
 * Lines as a native engine handed them over, checked: anything that is not a line with text and
 * a box is dropped, confidences outside 0 to 1 or missing become null, boxes are kept inside the
 * image. The JavaScript side never trusts the shape of a native answer.
 */
export function sanitizeLines(raw: unknown): OcrLine[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const lines: OcrLine[] = [];
  for (const entry of raw as unknown[]) {
    if (entry === null || typeof entry !== 'object') {
      continue;
    }
    const { text, confidence, box } = entry as {
      text?: unknown;
      confidence?: unknown;
      box?: unknown;
    };
    if (typeof text !== 'string' || text.trim().length === 0) {
      continue;
    }
    if (box === null || typeof box !== 'object') {
      continue;
    }
    const { x, y, width, height } = box as Record<string, unknown>;
    if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) {
      continue;
    }
    lines.push({
      text,
      confidence: finite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null,
      box: { ...insideImage(x, width, 'x', 'width'), ...insideImage(y, height, 'y', 'height') },
    });
  }
  return lines;
}
