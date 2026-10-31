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
    // The whole browsed region (board W1), not a view around the province: the far state too.
    expect(byCode.has('US-HI')).toBe(true);
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

  it('frames the same region whether or not the viewer has a province in it (U8)', () => {
    const withHome = staticMap(COLLECTION, 'americas-north', new Map(), 'CA-QC');
    const without = staticMap(COLLECTION, 'americas-north', new Map(), null);
    expect(withHome.shapes).toEqual(without.shapes);
    // The outline is the province's own shape in that view.
    expect(withHome.home).toBe(withHome.shapes.find((shape) => shape.code === 'CA-QC')?.d);
  });

  it('shows the whole region when the viewer has no province in it', () => {
    const map = staticMap(COLLECTION, 'americas-north', new Map(), null);
    expect(map.home).toBeNull();
    expect(map.shapes.map((shape) => shape.code).sort()).toEqual(['CA-ON', 'CA-QC', 'US-HI']);
  });
});
