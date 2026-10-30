import type { BoundaryCollection } from '../map/data/boundaries';
import { MAP_CARD_SIZE, staticMap } from './static-map';

const square = (west: number, south: number, size: number) => [
  [
    [west, south],
    [west + size, south],
    [west + size, south + size],
    [west, south + size],
    [west, south],
  ],
];

/** Three fictional provinces: two side by side, one far away. */
const COLLECTION: BoundaryCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { kind: 'subdivision', code: 'CA-QC', country: 'CA' },
      geometry: { type: 'Polygon', coordinates: square(-75, 46, 4) },
    },
    {
      type: 'Feature',
      properties: { kind: 'subdivision', code: 'CA-ON', country: 'CA' },
      geometry: { type: 'Polygon', coordinates: square(-79, 46, 4) },
    },
    {
      type: 'Feature',
      properties: { kind: 'subdivision', code: 'US-HI', country: 'US' },
      geometry: { type: 'Polygon', coordinates: square(-160, 19, 2) },
    },
    {
      type: 'Feature',
      properties: { kind: 'country', country: 'CA' },
      geometry: { type: 'Polygon', coordinates: square(-80, 45, 10) },
    },
  ],
};

describe("Home's map card drawing (spec 5.3: static SVG, no Leaflet)", () => {
  it('shades each state by its binder count and outlines the home province', () => {
    const map = staticMap(COLLECTION, 'americas-north', new Map([['CA-QC', 7]]), 'CA-QC');
    const byCode = new Map(map.shapes.map((shape) => [shape.code, shape]));
    expect(byCode.get('CA-QC')?.level).toBe(3);
    expect(byCode.get('CA-ON')?.level).toBe(0);
    expect(map.home).toMatch(/^M/);
    // Centred on the province and its neighbours: the far-away state is not drawn.
    expect(byCode.has('US-HI')).toBe(false);
    // Country outlines are not shapes.
    expect(map.shapes.every((shape) => shape.code)).toBe(true);
  });

  it('draws in card pixels with one decimal at most, never a position', () => {
    const map = staticMap(COLLECTION, 'americas-north', new Map(), 'CA-QC');
    const numbers = map.shapes.flatMap((shape) => shape.d.match(/-?\d+(\.\d+)?/g) ?? []);
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.every((n) => !/\.\d{2,}/.test(n))).toBe(true);
    const home = (map.home ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...home)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...home)).toBeLessThanOrEqual(MAP_CARD_SIZE.width);
  });

  it("keeps a small province's neighbours in view (never a single shape filling the card)", () => {
    const tiny: BoundaryCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { kind: 'subdivision', code: 'AR-C', country: 'AR' },
          geometry: { type: 'Polygon', coordinates: square(-58.5, -34.7, 0.2) },
        },
        {
          type: 'Feature',
          properties: { kind: 'subdivision', code: 'AR-B', country: 'AR' },
          geometry: { type: 'Polygon', coordinates: square(-61, -38, 3) },
        },
      ],
    };
    const map = staticMap(tiny, 'americas-south', new Map(), 'AR-C');
    expect(map.shapes.map((shape) => shape.code)).toContain('AR-B');
    const home = (map.home ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = home.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(MAP_CARD_SIZE.width / 4);
  });

  it('shows the whole region when the viewer has no province in it', () => {
    const map = staticMap(COLLECTION, 'americas-north', new Map(), null);
    expect(map.home).toBeNull();
    expect(map.shapes.map((shape) => shape.code).sort()).toEqual(['CA-ON', 'CA-QC', 'US-HI']);
  });
});
