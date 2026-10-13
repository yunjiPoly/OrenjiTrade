import {
  foldText,
  listPlaces,
  placeCodeFrom,
  placeLabelOf,
  regionOf,
} from '@/src/features/map/places';

import { regionsFixture } from '../support/fixtures';

const regions = regionsFixture();
const north = regionOf(regions, 'americas-north');
const europe = regionOf(regions, 'europe');
const counts = new Map([
  ['CA-QC', 2],
  ['CA-ON', 1],
]);

describe('the places of a region (the map list)', () => {
  it('groups the states and provinces by country, in the order of the server, with their counts', () => {
    expect(listPlaces(north, counts)).toEqual([
      {
        code: 'CA',
        name: 'Canada',
        count: 3,
        places: [
          { code: 'CA-ON', name: 'Ontario', label: 'Ontario, Canada', count: 1 },
          { code: 'CA-QC', name: 'Quebec', label: 'Quebec, Canada', count: 2 },
        ],
      },
      {
        code: 'US',
        name: 'United States',
        count: 0,
        places: [{ code: 'US-WY', name: 'Wyoming', label: 'Wyoming, United States', count: 0 }],
      },
    ]);
    expect(listPlaces(null, counts)).toEqual([]);
  });

  it('lists a whole-country entry under the name of its country', () => {
    const vatican = listPlaces(europe, new Map()).find((country) => country.code === 'VA');
    expect(vatican?.places).toEqual([
      { code: 'VA', name: 'Vatican City', label: 'Vatican City', count: 0 },
    ]);
  });

  it('leaves out a country the admins switched off', () => {
    const copy = regionsFixture();
    const region = regionOf(copy, 'americas-north');
    const canada = region?.countries.find((country) => country.code === 'CA');
    if (canada) {
      canada.active = false;
    }
    expect(listPlaces(region, counts).map((country) => country.code)).toEqual(['US']);
  });

  it('filters by a text without accents or case, by a country name, and by "only with binders"', () => {
    const codes = (filter: Parameters<typeof listPlaces>[2]) =>
      listPlaces(north, counts, filter).flatMap((country) => country.places.map((p) => p.code));
    expect(codes({ text: '  QUÉB ' })).toEqual(['CA-QC']);
    expect(codes({ text: 'o' })).toEqual(['CA-ON', 'US-WY']);
    expect(codes({ text: 'canada' })).toEqual(['CA-ON', 'CA-QC']);
    expect(codes({ text: 'atlantis' })).toEqual([]);
    expect(codes({ onlyWithBinders: true })).toEqual(['CA-ON', 'CA-QC']);
    expect(codes({ onlyWithBinders: true, text: 'ont' })).toEqual(['CA-ON']);
    // The count of a country is the count of what is listed under it.
    expect(listPlaces(north, counts, { text: 'ont' })[0]?.count).toBe(1);
    expect(foldText('Île-de-France')).toBe('ile-de-france');
  });

  it('labels a place of a region, and only of that region', () => {
    expect(placeLabelOf(north, 'CA-QC')).toBe('Quebec, Canada');
    expect(placeLabelOf(europe, 'VA')).toBe('Vatican City');
    expect(placeLabelOf(europe, 'CA-QC')).toBeNull();
    expect(placeLabelOf(null, 'CA-QC')).toBeNull();
    expect(regionOf(regions, 'atlantis')).toBeNull();
    expect(regionOf(undefined, 'europe')).toBeNull();
  });

  it('accepts the place code of a link in any case, and nothing that is not a code', () => {
    expect(placeCodeFrom('ca-qc')).toBe('CA-QC');
    expect(placeCodeFrom(' FR-IDF ')).toBe('FR-IDF');
    expect(placeCodeFrom('VA')).toBe('VA');
    expect(placeCodeFrom('GB-ENG')).toBe('GB-ENG');
    for (const value of [
      undefined,
      null,
      '',
      'Quebec',
      'CA-',
      'CA-QUEBEC',
      '45.5,-73.6',
      'CA/QC',
    ]) {
      expect(placeCodeFrom(value)).toBeNull();
    }
  });
});
