import { formatReleaseDay } from '@/src/lib/dates';

/** The words of a set page (mockup v50 screen 69, stage R14), in one place. */
export const SET_COPY = {
  set: 'Set',
  back: 'Back',
  whoHas: 'Who has cards of this set',
  tileHint: 'Opens who has this card, at this printing',
  loading: 'Loading the set',
  loadError: 'This set could not load',
  notFoundTitle: 'Set not found',
  notFoundBody: 'This set does not exist or is no longer in the catalog.',
  searchCatalog: 'Search the catalog',
  emptyTitle: 'No printings yet',
  emptyBody: 'This set has no printings in the catalog yet.',
} as const;

/** " · Released Nov 1, 2024 · 101 printings" after the set's code (no release: no date). */
export function setMeta(releaseDate: string | null | undefined, printings: number): string {
  const released = releaseDate ? ` · Released ${formatReleaseDay(releaseDate)}` : '';
  return `${released} · ${printings} ${printings === 1 ? 'printing' : 'printings'}`;
}
