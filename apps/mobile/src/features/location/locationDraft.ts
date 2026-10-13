import type { MyLocationResponse, PlatformRegion, RegionCountry } from '@/src/api/types';
import { CITY_MAX_LENGTH, DEFAULT_REGION } from '@/src/lib/place';

/**
 * What the collector declares (ADR 0017, mirror of the web's `LocationDraft`): a country and one
 * of its ISO 3166-2 subdivisions from `GET /regions`, an optional city and "show my city on my
 * profile". No coordinate, GPS fix or map pick exists.
 */
export interface LocationDraft {
  regionCode: string;
  countryCode: string;
  subdivisionCode: string;
  city: string;
  showCity: boolean;
}

export const EMPTY_DRAFT: LocationDraft = {
  regionCode: DEFAULT_REGION,
  countryCode: '',
  subdivisionCode: '',
  city: '',
  showCity: true,
};

/** The draft of a saved location, or an empty one in `region` without a location. */
export function draftFromLocation(
  location: MyLocationResponse | null | undefined,
  region: string = DEFAULT_REGION
): LocationDraft {
  const saved = location?.location;
  if (!saved) {
    return { ...EMPTY_DRAFT, regionCode: region };
  }
  return {
    regionCode: saved.regionCode,
    countryCode: saved.countryCode,
    subdivisionCode: saved.subdivisionCode,
    city: saved.city ?? '',
    showCity: saved.showCity,
  };
}

/** The active countries of a region, as the pickers list them. */
export function countriesOf(
  regions: readonly PlatformRegion[],
  regionCode: string
): RegionCountry[] {
  return (
    regions.find((region) => region.code === regionCode)?.countries.filter((c) => c.active) ?? []
  );
}

/** The country of a code across every region. */
export function countryOf(
  regions: readonly PlatformRegion[],
  countryCode: string
): RegionCountry | null {
  for (const region of regions) {
    const country = region.countries.find((candidate) => candidate.code === countryCode);
    if (country) {
      return country;
    }
  }
  return null;
}

/** A territory or micro-state: one pseudo-subdivision chosen together with the country. */
export function isWholeCountry(country: RegionCountry | null): boolean {
  return !!country && country.subdivisions.length === 1 && !!country.subdivisions[0]?.wholeCountry;
}

/** The draft after choosing a country (its single pseudo-subdivision is chosen with it). */
export function withCountry(
  draft: LocationDraft,
  regions: readonly PlatformRegion[],
  countryCode: string
): LocationDraft {
  const country = countryOf(regions, countryCode);
  return {
    ...draft,
    regionCode: country?.regionCode ?? draft.regionCode,
    countryCode,
    subdivisionCode: isWholeCountry(country) ? (country?.subdivisions[0]?.code ?? '') : '',
  };
}

/** The draft after choosing another region: the country of the old region is cleared. */
export function withRegion(draft: LocationDraft, regionCode: string): LocationDraft {
  return regionCode === draft.regionCode
    ? draft
    : { ...draft, regionCode, countryCode: '', subdivisionCode: '' };
}

/** What is still missing before the draft can be saved, or null when complete. */
export function missingField(draft: LocationDraft): string | null {
  if (!draft.countryCode) {
    return 'Choose your country.';
  }
  if (!draft.subdivisionCode) {
    return 'Choose your state or province.';
  }
  if (draft.city.trim().length > CITY_MAX_LENGTH) {
    return `Keep the city under ${CITY_MAX_LENGTH} characters.`;
  }
  return null;
}

/** Whether the draft differs from the saved location (city compared after trimming). */
export function isLocationDirty(
  draft: LocationDraft,
  location: MyLocationResponse | null | undefined
): boolean {
  const saved = location?.location;
  if (!saved) {
    return draft.countryCode !== '' || draft.subdivisionCode !== '';
  }
  return (
    draft.countryCode !== saved.countryCode ||
    draft.subdivisionCode !== saved.subdivisionCode ||
    draft.city.trim() !== (saved.city ?? '') ||
    draft.showCity !== saved.showCity
  );
}

/** The `PUT /me/location` input of a complete draft. */
export function locationInput(draft: LocationDraft) {
  return {
    countryCode: draft.countryCode,
    subdivisionCode: draft.subdivisionCode,
    city: draft.city,
    showCity: draft.showCity,
  };
}
