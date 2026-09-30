import { Point } from './privacy';

/**
 * Trading-area centres for the acceptance suite.
 *
 * Each acceptance spec owns a latitude band of northern Ontario / Manitoba (a region no other spec
 * uses), so concurrent specs never see each other's collectors, and each run picks a random spot
 * inside its band, so data left by earlier runs rarely lands nearby.
 *
 * Every centre sits exactly on a latitude line of the API's ~1 km public grid (a multiple of
 * 0.009°, ADR 0004) and never on a 0.01° line. The API derives public points at least 0.001° inside
 * a grid cell and snaps search centres to 2 decimals, so neither can ever coincide with a stored
 * centre by chance: the privacy scanner's "equals a stored trading-area centre" rule stays
 * deterministic and only fires on a genuine leak.
 */

/** Latitude grid step of the public grid, in thousandths of a degree. */
const ROW_MILLI = 9;
const FIRST_ROW = Math.ceil(50_400 / ROW_MILLI);
/** Rows per spec band (~0.2°, about 22 km). */
const BAND_ROWS = 24;
const LNG_MIN_MILLI = -96_000;
const LNG_SPAN_MILLI = 15_000;

/** One band per acceptance spec. */
export const BANDS = {
  registration: 0,
  inventory: 1,
  map: 2,
  search: 3,
  wishlist: 4,
  messaging: 5,
  offers: 6,
  rating: 7,
  reporting: 8,
  freemium: 9,
  privacy: 10,
  deletion: 11,
  payments: 12,
  community: 13,
  staleListings: 14,
} as const;

export type Band = keyof typeof BANDS;

function onGrid(row: number, lngMilli: number): Point {
  let safeRow = row;
  if (safeRow % 10 === 0) {
    safeRow += 1; // never on a 0.01° line (2-decimal centres would equal a snapped search centre)
  }
  let safeLng = lngMilli;
  if (safeLng % 10 === 0) {
    safeLng += 3;
  }
  return { lat: (safeRow * ROW_MILLI) / 1000, lng: safeLng / 1000 };
}

/** A random centre inside the band of `band` (3 decimals, on a public-grid latitude line). */
export function randomCentre(band: Band): Point {
  const row = FIRST_ROW + BANDS[band] * BAND_ROWS + 2 + Math.floor(Math.random() * (BAND_ROWS - 6));
  const lng = LNG_MIN_MILLI + Math.floor(Math.random() * LNG_SPAN_MILLI);
  return onGrid(row, lng);
}

/**
 * A centre about 1–2 km from `centre` (`rows` grid lines north, `lngMilli` thousandths of a
 * degree east), still on a grid line.
 */
export function besides(centre: Point, rows = 1, lngMilli = -13): Point {
  const row = Math.round((centre.lat * 1000) / ROW_MILLI) + rows;
  return onGrid(row, Math.round(centre.lng * 1000) + lngMilli);
}
