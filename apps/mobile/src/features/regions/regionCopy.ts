/**
 * The approved English copy of the region pill and its sheet (stage G of the phone redesign,
 * mockup screen 35, version 50), in one place.
 */
export const REGION_COPY = {
  /** What a screen reader says for the pill. */
  pillLabel: (name: string) => `Region: ${name}. Change region`,
  sheetTitle: 'Choose a region',
  sheetIntro: 'Home, Search and the map show one region at a time. Cards ship within a region.',
  groupLabel: 'Region',
  yourRegion: 'Your region',
  footnote:
    'Your own region comes from Settings › Location. Browsing another one changes nothing on your profile.',
  notYours: 'Not your region.',
  backTo: (home: string) => `Back to ${home}`,
} as const;

/** A few countries of each platform region, as the mockup names them. */
const COUNTRIES: Readonly<Record<string, string>> = {
  'americas-north': 'Canada, United States, Mexico',
  'americas-south': 'Brazil, Argentina, Chile and more',
  europe: 'France, Germany, Spain and more',
};

/**
 * The second line of a region in "Choose a region": "Your region · Canada, United States, Mexico"
 * for the collector's own, a few countries for the others. A region the app has no line for (one
 * the server adds) names its first three countries from `GET /regions`.
 */
export function regionLine(
  code: string,
  mine: boolean,
  countries?: readonly string[] | null
): string | undefined {
  const known = COUNTRIES[code];
  const names = (countries ?? []).filter(Boolean);
  const few =
    known ??
    (names.length === 0
      ? undefined
      : names.length > 3
        ? `${names.slice(0, 3).join(', ')} and more`
        : names.join(', '));
  if (mine) {
    return few ? `${REGION_COPY.yourRegion} · ${few}` : REGION_COPY.yourRegion;
  }
  return few;
}
