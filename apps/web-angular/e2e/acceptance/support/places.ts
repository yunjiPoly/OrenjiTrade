import type { LocationInput } from '../../support/stack';

/**
 * Self-declared places of the acceptance suite (ADR 0017: country + ISO 3166-2 subdivision, no
 * coordinates).
 *
 * Each acceptance spec owns a state of its own (one that no seed collector and no other spec
 * uses), so a spec never meets another spec's collectors in a state's binder list. Wishlist
 * alerts work per platform region, so the wishlist spec lives in Europe, where no other
 * acceptance spec lists cards. Assertions are about each test's own fresh collectors, so data left
 * by earlier runs does not matter.
 */
export interface Place extends LocationInput {
  regionCode: string;
  /** The public label the API shows ("Alabama, United States"). */
  label: string;
}

function us(code: string, name: string): Place {
  return {
    countryCode: 'US',
    subdivisionCode: `US-${code}`,
    regionCode: 'americas-north',
    label: `${name}, United States`,
  };
}

/** One place per acceptance spec. */
export const PLACES = {
  registration: us('AL', 'Alabama'),
  inventory: us('AZ', 'Arizona'),
  map: us('AR', 'Arkansas'),
  search: us('CO', 'Colorado'),
  wishlist: {
    countryCode: 'PT',
    subdivisionCode: 'PT-11',
    regionCode: 'europe',
    label: 'Lisbon, Portugal',
  },
  messaging: us('DE', 'Delaware'),
  offers: us('ID', 'Idaho'),
  rating: us('IA', 'Iowa'),
  reporting: us('KS', 'Kansas'),
  freemium: us('KY', 'Kentucky'),
  privacy: us('LA', 'Louisiana'),
  deletion: us('ME', 'Maine'),
  payments: us('MT', 'Montana'),
  community: us('NE', 'Nebraska'),
  staleListings: us('NV', 'Nevada'),
} as const satisfies Record<string, Place>;

export type Band = keyof typeof PLACES;

/** The place of a spec, optionally with a city (shown on the owner's profile only). */
export function placeOf(band: Band, city?: string): Place {
  return city ? { ...PLACES[band], city, showCity: true } : PLACES[band];
}

/** A distinctive fictional city name the privacy scanner can find anywhere it leaks. */
export function cityToken(): string {
  return `Zqcity${Math.random().toString(36).slice(2, 8)}`;
}
