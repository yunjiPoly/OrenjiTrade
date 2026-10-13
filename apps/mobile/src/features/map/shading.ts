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
