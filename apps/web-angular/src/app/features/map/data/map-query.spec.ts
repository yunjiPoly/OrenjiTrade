import { MapViewport } from '../../../shared/map/map-adapter';
import {
  NearbyQuery,
  chosenRadiusKm,
  filterKey,
  isCovered,
  nearbyRequest,
  queryRadiusKm,
  radiusCapKm,
  roundCentre,
  visibleRadiusKm,
} from './map-query';

function query(overrides: Partial<NearbyQuery> = {}): NearbyQuery {
  return {
    centre: { lat: 45.5087, lng: -73.5617 },
    radiusKm: 10,
    limitKm: 10,
    game: null,
    availability: null,
    freshness: null,
    tags: [],
    cardId: null,
    printingId: null,
    ...overrides,
  };
}

describe('map query', () => {
  it('measures the visible radius to the farthest corner', () => {
    const viewport: MapViewport = {
      center: { lat: 45.5, lng: -73.6 },
      zoom: 12,
      bounds: { north: 45.55, south: 45.45, east: -73.5, west: -73.7 },
    };
    const radius = visibleRadiusKm(viewport);
    // Half the diagonal of a ~15.6 km × 11.1 km box.
    expect(radius).toBeGreaterThan(9);
    expect(radius).toBeLessThan(10);
  });

  it('never asks beyond the chosen radius nor below 1 km', () => {
    expect(queryRadiusKm(3.2, 10)).toBe(3.5);
    expect(queryRadiusKm(42, 10)).toBe(10);
    expect(queryRadiusKm(0.1, 10)).toBe(1);
    expect(queryRadiusKm(null, 25)).toBe(25);
  });

  it('bounds the chosen radius by the plan', () => {
    expect(chosenRadiusKm(null, 25)).toBe(10);
    expect(chosenRadiusKm(80, 25)).toBe(25);
    expect(chosenRadiusKm(80, 100)).toBe(80);
    expect(radiusCapKm(25)).toBe(25);
    expect(radiusCapKm(null)).toBe(100);
    expect(radiusCapKm(500)).toBe(100);
  });

  it('sends the centre with 2 decimals only and the filters that are set', () => {
    expect(roundCentre({ lat: 45.50871, lng: -73.56172 })).toEqual({ lat: 45.51, lng: -73.56 });
    expect(
      nearbyRequest(
        query({ game: 'yugioh', availability: 'SALE', tags: ['trader'], cardId: 'c1' }),
      ),
    ).toEqual({
      lat: 45.51,
      lng: -73.56,
      radiusKm: 10,
      limit: 200,
      game: 'yugioh',
      availability: 'SALE',
      tags: ['trader'],
      hasCardId: 'c1',
    });
  });

  it('lets the server use the caller trading area when there is no centre', () => {
    const request = nearbyRequest(query({ centre: null, printingId: 'p1', cardId: 'c1' }));
    expect(request.lat).toBeUndefined();
    expect(request.lng).toBeUndefined();
    expect(request.hasPrintingId).toBe('p1');
    expect(request.hasCardId).toBeUndefined();
  });

  it('skips queries inside the area the last answer covered', () => {
    const area = {
      centre: { lat: 45.51, lng: -73.56 },
      radiusKm: 10,
      filterKey: filterKey(query()),
    };
    // Zooming in around the same centre.
    expect(isCovered(query({ radiusKm: 2 }), area)).toBe(true);
    // Panning far away.
    expect(isCovered(query({ centre: { lat: 45.7, lng: -73.56 }, radiusKm: 5 }), area)).toBe(false);
    // Other filters or another chosen radius always re-query.
    expect(isCovered(query({ radiusKm: 2, game: 'mtg' }), area)).toBe(false);
    expect(isCovered(query({ radiusKm: 2, limitKm: 5 }), area)).toBe(false);
    expect(isCovered(query({ centre: null }), area)).toBe(false);
    expect(isCovered(query(), null)).toBe(false);
  });
});
