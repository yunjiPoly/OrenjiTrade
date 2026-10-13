import fs from 'node:fs';
import path from 'node:path';

import {
  MAX_MAP_ZOOM,
  baseWindow,
  liveTransform,
  panWindow,
  pointToUnits,
  sameWindow,
  settleWindow,
  unitsPerPoint,
  viewBoxOf,
  zoomOf,
  zoomWindow,
  type MapWindow,
} from '@/src/features/map/mapWindow';
import { SUBDIVISION_CODE } from '@/src/features/map/places';
import {
  hasRegionOutline,
  loadRegionOutline,
  meshPath,
  ringsContain,
  ringsOf,
  ringsOfPath,
  shapeAt,
  type RegionOutline,
  type RegionShape,
} from '@/src/features/map/regionOutline';
import {
  SHADE_LEGEND,
  SHADE_OPACITY,
  binderCountLabel,
  countsByCode,
  shadeLevel,
} from '@/src/features/map/shading';

import outlines from '../../scripts/lib/boundaryOutlines';

const ROOT = path.resolve(__dirname, '..', '..');
const WEB_BOUNDARIES = path.join(ROOT, '..', 'web-angular', 'public', 'boundaries');
const WEB_MAP_DATA = path.join(
  ROOT,
  '..',
  'web-angular',
  'src',
  'app',
  'features',
  'map',
  'data',
  'boundaries.ts'
);
const REGIONS = ['americas-north', 'americas-south', 'europe'] as const;

const read = (file: string) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const webFile = (region: string) => path.join(WEB_BOUNDARIES, `${region}.json`);
const appFile = (region: string) => path.join(ROOT, 'assets', 'boundaries', `${region}.json`);

/** A square island and a square with a hole, as the web's files describe them (degrees). */
const SAMPLE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { code: 'ZZ-A', country: 'ZZ', kind: 'subdivision' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-10, 40],
            [0, 40],
            [0, 50],
            [-10, 50],
            [-10, 40],
          ],
          [
            [-6, 44],
            [-4, 44],
            [-4, 46],
            [-6, 46],
            [-6, 44],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { code: 'ZZ-B', country: 'ZZ', kind: 'subdivision' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 40],
              [10, 40],
              [10, 50],
              [0, 50],
              [0, 40],
            ],
          ],
          [
            [
              [12, 41],
              [13, 41],
              [13, 42],
              [12, 42],
              [12, 41],
            ],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { country: 'ZZ', kind: 'country' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-10, 40],
            [10, 40],
            [10, 50],
            [-10, 50],
            [-10, 40],
          ],
        ],
      },
    },
  ],
};

/** The drawing of the sample, as the app reads it. */
function sampleOutline(): RegionOutline {
  return outlines.buildRegionOutline('europe', SAMPLE).outline;
}

function shapeOf(outline: RegionOutline, code: string): RegionShape {
  const shape = outline.shapes.find((candidate) => candidate.code === code);
  if (!shape) {
    throw new Error(`${code} is not drawn`);
  }
  return shape;
}

describe('projection of the boundaries (scripts/lib/boundaryOutlines.js)', () => {
  it('uses Web Mercator: the equator at 0, symmetric, stretched towards the poles', () => {
    expect(outlines.mercatorDegrees(0)).toBeCloseTo(0, 10);
    expect(outlines.mercatorDegrees(45)).toBeCloseTo(50.4987, 3);
    expect(outlines.mercatorDegrees(-45)).toBeCloseTo(-50.4987, 3);
    expect(outlines.mercatorDegrees(60)).toBeCloseTo(75.4561, 3);
    // The poles are clipped where Leaflet clips them.
    expect(outlines.mercatorDegrees(90)).toBe(
      outlines.mercatorDegrees(outlines.MERCATOR_LIMIT_DEGREES)
    );
    expect(Number.isFinite(outlines.mercatorDegrees(-90))).toBe(true);
  });

  it('measures the extent of a collection and projects to whole units from its north-west corner', () => {
    const extent = outlines.extentOf(SAMPLE.features);
    expect(extent).toEqual({ west: -10, south: 40, east: 13, north: 50 });
    const projection = outlines.createProjection(extent);
    // One unit is a hundredth of a degree of longitude.
    expect(outlines.UNITS_PER_DEGREE).toBe(100);
    expect(projection.point([-10, 50])).toEqual([0, 0]);
    expect(projection.point([0, 50])).toEqual([1000, 0]);
    expect(projection.width).toBe(2300);
    // 40°N to 50°N is taller than 10° of longitude is wide (Mercator), and y grows southwards.
    expect(projection.height).toBe(projection.y(40));
    expect(projection.height).toBeGreaterThan(1400);
    expect(projection.height).toBeLessThan(1500);
    for (const value of [
      ...projection.point([-3.33, 44.44]),
      projection.width,
      projection.height,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('writes a ring as an absolute start and relative steps, without the closing point', () => {
    expect(
      outlines.ringPath([
        [10, 20],
        [15, 20],
        [15, 14],
        [10, 14],
      ])
    ).toBe('M10 20l5 0 0 -6 -5 0z');
    const projection = outlines.createProjection({ west: 0, south: 0, east: 1, north: 1 });
    // Points that fall on the same unit are merged; a ring that collapses is dropped.
    expect(
      outlines.projectRing(
        [
          [0, 1],
          [0.001, 1],
          [1, 1],
          [1, 0],
          [0, 1],
        ],
        projection
      )
    ).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
    expect(
      outlines.projectRing(
        [
          [0, 1],
          [0.001, 1],
          [0, 1],
        ],
        projection
      )
    ).toBeNull();
  });

  it('builds the drawing of a region: shapes by code with their box, one path of country borders', () => {
    const { stats } = outlines.buildRegionOutline('europe', SAMPLE);
    const outline = sampleOutline();
    expect(outline.region).toBe('europe');
    expect(outline.width).toBe(2300);
    expect(outline.shapes.map((shape) => shape.code)).toEqual(['ZZ-A', 'ZZ-B']);
    const a = shapeOf(outline, 'ZZ-A');
    const b = shapeOf(outline, 'ZZ-B');
    expect(a.box).toEqual([0, 0, 1000, outline.height]);
    expect(a.d.match(/M/g)).toHaveLength(2); // the square and its hole
    expect(b.d.match(/M/g)).toHaveLength(2); // the square and its island
    expect(b.box[2]).toBe(2300);
    expect(outline.outline.match(/M/g)).toHaveLength(1);
    expect(stats).toEqual({ shapes: 2, rings: 5, points: 20 });
    // The first view is the one the web fits, kept on the drawing.
    const [x = -1, y = -1, width = 0, height = 0] = outline.home;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(outline.width);
    expect(y + height).toBeLessThanOrEqual(outline.height);
    // The file is JSON with one line per shape.
    const text = outlines.renderRegionOutline(outline);
    expect(JSON.parse(text)).toEqual(outline);
    expect(text.split('\n').filter((line: string) => line.includes('"code"'))).toHaveLength(2);
  });

  it('refuses a region it has no first view for, and a code drawn twice', () => {
    expect(() => outlines.buildRegionOutline('atlantis', SAMPLE)).toThrow(/No first view/);
    const twice = { ...SAMPLE, features: [SAMPLE.features[0], SAMPLE.features[0]] };
    expect(() => outlines.buildRegionOutline('europe', twice)).toThrow(/drawn twice/);
  });

  it('fits the same first view as the web map (REGION_VIEW of the web app)', () => {
    const source = read(WEB_MAP_DATA);
    const table = source.slice(
      source.indexOf('export const REGION_VIEW'),
      source.indexOf('/** "1 public binder"')
    );
    for (const region of REGIONS) {
      const start = table.indexOf(region === 'europe' ? 'europe:' : `'${region}':`);
      expect(start).toBeGreaterThan(-1);
      const numbers = (table.slice(start).match(/-?\d+(\.\d+)?/g) ?? []).slice(0, 4).map(Number);
      expect(outlines.REGION_VIEW[region].flat()).toEqual(numbers);
    }
    expect(Object.keys(outlines.REGION_VIEW).sort()).toEqual([...REGIONS].sort());
  });
});

describe("the app's drawings (assets/boundaries, npm run sync:boundaries)", () => {
  it.each(REGIONS)('%s is exactly what the web file gives', (region) => {
    const { outline } = outlines.buildRegionOutline(region, JSON.parse(read(webFile(region))));
    expect(read(appFile(region))).toBe(outlines.renderRegionOutline(outline));
  });

  it.each(REGIONS)(
    '%s holds drawing units only: no degree, no decimal, no key of a position',
    (region) => {
      const text = read(appFile(region));
      // Whole numbers everywhere (a degree would carry decimals), and only the keys of a drawing.
      expect(text).not.toMatch(/\d\.\d/);
      const file = JSON.parse(text) as RegionOutline;
      expect(Object.keys(file).sort()).toEqual(
        ['height', 'home', 'outline', 'region', 'shapes', 'width'].sort()
      );
      expect(file.region).toBe(region);
      const codes = new Set<string>();
      for (const shape of file.shapes) {
        expect(Object.keys(shape).sort()).toEqual(['box', 'code', 'd']);
        expect(shape.code).toMatch(SUBDIVISION_CODE);
        expect(codes.has(shape.code)).toBe(false);
        codes.add(shape.code);
        expect(shape.d).toMatch(/^(M\d+ \d+l(-?\d+ -?\d+ ?)+z)+$/);
        const [left = 0, top = 0, right = 0, bottom = 0] = shape.box;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(file.width);
        expect(bottom).toBeLessThanOrEqual(file.height);
      }
      // Lighter than the web's GeoJSON, and small enough to ship three of them.
      expect(text.length).toBeLessThan(fs.statSync(webFile(region)).size / 2);
      expect(text.length).toBeLessThan(160 * 1024);
    }
  );

  it('draws every state and province the web draws', () => {
    const drawn: Record<string, number> = {};
    for (const region of REGIONS) {
      const web = JSON.parse(read(webFile(region))) as {
        features: { properties: { kind: string; code?: string } }[];
      };
      const expected = web.features
        .filter((feature) => feature.properties.kind === 'subdivision')
        .map((feature) => feature.properties.code)
        .sort();
      const file = JSON.parse(read(appFile(region))) as RegionOutline;
      expect(file.shapes.map((shape) => shape.code)).toEqual(expected);
      drawn[region] = file.shapes.length;
    }
    expect(drawn).toEqual({ 'americas-north': 348, 'americas-south': 243, europe: 653 });
  });
});

describe('reading a drawing in the app (regionOutline.ts)', () => {
  it('loads a region once, and only the regions the app ships', async () => {
    expect(hasRegionOutline('europe')).toBe(true);
    expect(hasRegionOutline('atlantis')).toBe(false);
    expect(hasRegionOutline('toString')).toBe(false);
    const first = loadRegionOutline('americas-south');
    expect(loadRegionOutline('americas-south')).toBe(first);
    expect((await first).region).toBe('americas-south');
    await expect(loadRegionOutline('atlantis')).rejects.toThrow(/No drawing/);
  });

  it('reads path data back into the rings the script projected', () => {
    expect(ringsOfPath('M10 20l5 0 0 -6 -5 0zM100 100l1 0 0 1z')).toEqual([
      [10, 20, 15, 20, 15, 14, 10, 14],
      [100, 100, 101, 100, 101, 101],
    ]);
    expect(ringsOfPath('')).toEqual([]);
    const outline = sampleOutline();
    const projection = outlines.createProjection(outlines.extentOf(SAMPLE.features));
    const hole = SAMPLE.features[0]?.geometry.coordinates[1] as [number, number][];
    const expected = hole.slice(0, -1).flatMap((position) => projection.point(position));
    const a = shapeOf(outline, 'ZZ-A');
    expect(ringsOf(a)[1]).toEqual(expected);
    // Read once per shape.
    expect(ringsOf(a)).toBe(ringsOf(a));
  });

  it('finds the state under a point: islands count, holes and the sea do not', () => {
    const outline = sampleOutline();
    const projection = outlines.createProjection(outlines.extentOf(SAMPLE.features));
    const at = (longitude: number, latitude: number, reach = 0) =>
      shapeAt(outline, projection.x(longitude), projection.y(latitude), reach);
    expect(at(-8, 48)).toBe('ZZ-A');
    expect(at(5, 45)).toBe('ZZ-B');
    expect(at(12.5, 41.5)).toBe('ZZ-B'); // its island
    expect(at(-5, 45)).toBeNull(); // the hole of ZZ-A
    expect(at(11, 45)).toBeNull(); // the sea between ZZ-B and its island
    // A finger beside a small island still picks it, and the nearest shape wins.
    expect(at(13.2, 41.5, 30)).toBe('ZZ-B');
    expect(at(13.2, 41.5, 10)).toBeNull();
    expect(at(-5, 45, 150)).toBe('ZZ-A');
    expect(ringsContain(ringsOf(shapeOf(outline, 'ZZ-A')), 1, 1)).toBe(true);
    expect(ringsContain(ringsOf(shapeOf(outline, 'ZZ-A')), -5, -5)).toBe(false);
  });

  it('finds real states in the shipped drawings', async () => {
    const north = await loadRegionOutline('americas-north');
    const centreOf = (code: string) => {
      const [left = 0, top = 0, right = 0, bottom = 0] = shapeOf(north, code).box;
      return { x: (left + right) / 2, y: (top + bottom) / 2 };
    };
    // Wyoming and Colorado are rectangles: the centre of their box is theirs.
    for (const code of ['US-WY', 'US-CO', 'CA-SK']) {
      const centre = centreOf(code);
      expect(shapeAt(north, centre.x, centre.y)).toBe(code);
    }
    // The mid Atlantic, far from any shape.
    expect(shapeAt(north, north.width - 1, north.height / 2, 20)).toBeNull();
    // One path for every state: as many rings as the shapes hold.
    const mesh = meshPath(north);
    expect(mesh.match(/M/g)).toHaveLength(
      north.shapes.reduce((sum, shape) => sum + ringsOf(shape).length, 0)
    );
  });
});

describe('shading (the web steps and words)', () => {
  it('has five steps: none, 1, 2 to 4, 5 to 9, 10 and more', () => {
    expect([undefined, null, 0, -3].map(shadeLevel)).toEqual([0, 0, 0, 0]);
    expect([1, 2, 4, 5, 9, 10, 250].map(shadeLevel)).toEqual([1, 2, 2, 3, 3, 4, 4]);
    expect(SHADE_LEGEND.map((step) => step.label)).toEqual(['None', '1', '2–4', '5–9', '10+']);
    expect(SHADE_LEGEND.map((step) => step.level)).toEqual([0, 1, 2, 3, 4]);
    // Darker with more binders; an empty state keeps the surface colour.
    const opacities = SHADE_LEGEND.map((step) => SHADE_OPACITY[step.level]);
    expect(opacities[0]).toBe(0);
    expect([...opacities].sort((a, b) => a - b)).toEqual(opacities);
    expect(new Set(opacities).size).toBe(5);
  });

  it('matches the web table', () => {
    const source = read(WEB_MAP_DATA);
    for (const [level, opacity] of Object.entries(SHADE_OPACITY)) {
      expect(source).toContain(`${level}: ${opacity},`);
    }
    for (const step of SHADE_LEGEND) {
      expect(source).toContain(`{ level: ${step.level}, label: '${step.label}' }`);
    }
  });

  it('words a count and indexes the counts of the API', () => {
    expect(binderCountLabel(0)).toBe('No public binders');
    expect(binderCountLabel(undefined)).toBe('No public binders');
    expect(binderCountLabel(1)).toBe('1 public binder');
    expect(binderCountLabel(12)).toBe('12 public binders');
    const counts = countsByCode([
      { code: 'CA-QC', binderCount: 2 },
      { code: 'CA-ON', binderCount: 1 },
      { code: 'US-WY', binderCount: 0 },
    ]);
    expect([...counts]).toEqual([
      ['CA-QC', 2],
      ['CA-ON', 1],
    ]);
    expect(countsByCode(undefined).size).toBe(0);
  });
});

describe('the window on a drawing (mapWindow.ts)', () => {
  const outline: RegionOutline = {
    region: 'test',
    width: 1000,
    height: 2000,
    home: [100, 600, 800, 800],
    outline: '',
    shapes: [],
  };
  const frame = { width: 400, height: 200 };

  it('starts on the first view, grown to the shape of the frame and kept on the drawing', () => {
    const base = baseWindow(outline, frame);
    // A wide frame: the square first view keeps its height and grows sideways, centred on the
    // drawing because it is now wider than it.
    expect(base).toEqual({ x: -300, y: 600, width: 1600, height: 800 });
    expect(base.width / base.height).toBe(frame.width / frame.height);
    // A tall frame keeps the width and grows in height.
    const tall = baseWindow(outline, { width: 200, height: 400 });
    expect(tall).toEqual({ x: 100, y: 200, width: 800, height: 1600 });
    // Without a usable first view the whole drawing shows.
    const whole = baseWindow({ ...outline, home: [] }, { width: 100, height: 200 });
    expect(whole).toEqual({ x: 0, y: 0, width: 1000, height: 2000 });
  });

  it('keeps a window inside the drawing, or centred on an axis it covers', () => {
    expect(settleWindow({ x: -50, y: 1900, width: 500, height: 500 }, outline)).toEqual({
      x: 0,
      y: 1500,
      width: 500,
      height: 500,
    });
    expect(settleWindow({ x: 700, y: -20, width: 3000, height: 100 }, outline)).toMatchObject({
      x: -1000,
      y: 0,
    });
  });

  it('zooms between 1 and the maximum, about the centre or about the fingers', () => {
    const base = baseWindow(outline, frame);
    expect(zoomOf(base, base)).toBe(1);
    const twice = zoomWindow(base, base, outline, 2);
    expect(zoomOf(twice, base)).toBe(2);
    expect(twice).toEqual({ x: 100, y: 800, width: 800, height: 400 });
    // The centre of the frame shows the same point of the drawing before and after.
    expect(pointToUnits(twice, frame, 200, 100)).toEqual(pointToUnits(base, frame, 200, 100));
    // About the fingers: the point under them stays under them.
    const pinched = zoomWindow(twice, base, outline, 2, { x: 0.25, y: 0.75 });
    expect(pointToUnits(pinched, frame, 100, 150)).toEqual(pointToUnits(twice, frame, 100, 150));
    // Never further out than the first view, never further in than the maximum.
    expect(sameWindow(zoomWindow(base, base, outline, 0.25), base)).toBe(true);
    let deep: MapWindow = base;
    for (let step = 0; step < 12; step++) {
      deep = zoomWindow(deep, base, outline, 2);
    }
    expect(zoomOf(deep, base)).toBe(MAX_MAP_ZOOM);
    expect(sameWindow(zoomWindow(deep, base, outline, 1 / 4096), base)).toBe(true);
  });

  it('moves the drawing with the finger and stops at its edges', () => {
    const base = baseWindow(outline, frame);
    const twice = zoomWindow(base, base, outline, 2);
    // 2 units per point at this zoom: 50 points to the right show what was 100 units to the left.
    expect(unitsPerPoint(twice, frame)).toBe(2);
    expect(panWindow(twice, outline, frame, 50, -10)).toEqual({
      x: 0,
      y: 820,
      width: 800,
      height: 400,
    });
    expect(panWindow(twice, outline, frame, 5000, 5000)).toMatchObject({ x: 0, y: 0 });
    expect(panWindow(twice, outline, frame, -5000, -5000)).toMatchObject({ x: 200, y: 1600 });
    // At zoom 1 the wide first view cannot move sideways, but the drawing above and below can
    // be reached.
    expect(panWindow(base, outline, frame, 300, 0)).toEqual(base);
    expect(panWindow(base, outline, frame, 0, 100).y).toBe(200);
  });

  it('slides and scales the drawn picture exactly onto the window of a gesture', () => {
    const base = baseWindow(outline, frame);
    const drawn = zoomWindow(base, base, outline, 2);
    const live = panWindow(
      zoomWindow(drawn, base, outline, 1.6, { x: 0.3, y: 0.6 }),
      outline,
      frame,
      37,
      -21
    );
    const { scale, translateX, translateY } = liveTransform(drawn, live, frame);
    expect(scale).toBeCloseTo(1.6, 10);
    // React Native scales about the centre of the view, then translates.
    const onScreen = (x: number, y: number) => ({
      x: frame.width / 2 + scale * (x - frame.width / 2) + translateX,
      y: frame.height / 2 + scale * (y - frame.height / 2) + translateY,
    });
    for (const [x, y] of [
      [0, 0],
      [400, 200],
      [123, 77],
    ] as const) {
      // A point of the drawing, where the picture drawn for `drawn` shows it...
      const unit = pointToUnits(drawn, frame, x, y);
      // ...lands where the window of the gesture would draw it.
      const moved = onScreen(x, y);
      const again = pointToUnits(live, frame, moved.x, moved.y);
      expect(again.x).toBeCloseTo(unit.x, 6);
      expect(again.y).toBeCloseTo(unit.y, 6);
    }
    expect(liveTransform(drawn, drawn, frame)).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it('writes a viewBox', () => {
    expect(viewBoxOf({ x: -300, y: 600, width: 1600, height: 800 })).toBe('-300 600 1600 800');
    expect(viewBoxOf({ x: 1 / 3, y: 0, width: 10.006, height: 5 })).toBe('0.33 0 10.01 5');
  });
});
