/**
 * Shading of the region map (ADR 0017, mirror of the web's `features/map/data/boundaries.ts`): a
 * state or province is tinted by its number of public binders, in the same five steps and with
 * the same words as the web.
 */

/** Shading step of a state or province by its public binder count (0: none). */
export type ShadeLevel = 0 | 1 | 2 | 3 | 4;

export function shadeLevel(count: number | null | undefined): ShadeLevel {
  if (!count || count <= 0) {
    return 0;
  }
  if (count === 1) {
    return 1;
  }
  if (count <= 4) {
    return 2;
  }
  return count <= 9 ? 3 : 4;
}

/** Legend of the shading steps, lightest first. */
export const SHADE_LEGEND: readonly { level: ShadeLevel; label: string }[] = [
  { level: 0, label: 'None' },
  { level: 1, label: '1' },
  { level: 2, label: '2–4' },
  { level: 3, label: '5–9' },
  { level: 4, label: '10+' },
];

/** Opacity of the primary colour per step (step 0 keeps the surface colour). */
export const SHADE_OPACITY: Readonly<Record<ShadeLevel, number>> = {
  0: 0,
  1: 0.28,
  2: 0.48,
  3: 0.68,
  4: 0.88,
};

/** "1 public binder" / "3 public binders" / "No public binders". */
export function binderCountLabel(count: number | null | undefined): string {
  if (!count || count <= 0) {
    return 'No public binders';
  }
  return `${count} public ${count === 1 ? 'binder' : 'binders'}`;
}

/** Public binders per state or province code, from the `subdivisions` of the API's answer. */
export function countsByCode(
  subdivisions: readonly { code: string; binderCount: number }[] | null | undefined
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const entry of subdivisions ?? []) {
    if (entry.binderCount > 0) {
      counts.set(entry.code, entry.binderCount);
    }
  }
  return counts;
}

/** A shaded state or province narrower and shorter than this many points gets a mark. */
export const MARK_BELOW = 14;
/** Radius of that mark, in points. */
export const MARK_RADIUS = 5;
/** A tap this close to a mark's centre (in points) opens its place. */
export const MARK_REACH = 12;

/**
 * A place with binders too small to be seen on the map at the current zoom, where to mark it, and
 * the step of the legend its count belongs to: the mark is tinted like the place itself would be.
 */
export interface PlaceMark {
  code: string;
  x: number;
  y: number;
  level: Exclude<ShadeLevel, 0>;
}

/**
 * The places with public binders that are only a few points wide at the current zoom (Malta, the
 * Paris region or Rhode Island at the first view): the map marks each with a dot, so a region whose
 * binders are all in small places does not look empty. `unitsPerPoint` is the zoom (drawing units
 * under one point of the screen); zoomed in far enough, a place is drawn large and needs no mark.
 */
export function placeMarks(
  shapes: readonly { code: string; box: readonly number[] }[],
  counts: ReadonlyMap<string, number>,
  unitsPerPoint: number
): PlaceMark[] {
  const limit = MARK_BELOW * unitsPerPoint;
  const marks: PlaceMark[] = [];
  for (const shape of shapes) {
    const level = shadeLevel(counts.get(shape.code));
    if (level === 0) {
      continue;
    }
    const [left = 0, top = 0, right = 0, bottom = 0] = shape.box;
    if (right - left < limit && bottom - top < limit) {
      marks.push({ code: shape.code, x: (left + right) / 2, y: (top + bottom) / 2, level });
    }
  }
  return marks;
}

/** The mark under a point of the drawing (the closest within `reach` units), or null. */
export function markAt(
  marks: readonly Pick<PlaceMark, 'code' | 'x' | 'y'>[],
  x: number,
  y: number,
  reach: number
): string | null {
  let closest: string | null = null;
  let closestGap = reach * reach;
  for (const mark of marks) {
    const gap = (mark.x - x) ** 2 + (mark.y - y) ** 2;
    if (gap <= closestGap) {
      closestGap = gap;
      closest = mark.code;
    }
  }
  return closest;
}
