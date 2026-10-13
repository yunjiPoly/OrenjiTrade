'use strict';
/**
 * Turns a region's boundary file of the web app (GeoJSON in degrees, built from Natural Earth by
 * `scripts/regions/build.mjs`) into the drawing the mobile app bundles: outlines in whole drawing
 * units, as SVG path data. CommonJS on purpose: `sync-boundaries.mjs` and the jest suite load the
 * same file.
 *
 * The degrees stop here. The app's source and bundle hold drawing units only (ADR 0017: no
 * coordinate anywhere in the app; `__tests__/privacy/coordinateLiterals.test.ts` keeps `src/` and
 * `app/` free of them), and nothing below is ever a collector's place: these are public
 * administrative borders.
 *
 * Projection: Web Mercator, the projection of the web's Leaflet map, so both clients draw the
 * same picture. One drawing unit is one hundredth of a degree of longitude, which is the
 * precision of the source files: no detail is lost and none is invented.
 */

/** Drawing units per degree of longitude (the source files have 2 decimals). */
const UNITS_PER_DEGREE = 100;
/** Web Mercator is undefined at the poles; Leaflet clips at the same parallel. */
const MERCATOR_LIMIT_DEGREES = 85.0511;
const RADIANS = Math.PI / 180;

/**
 * First view of each region: the corners the web map fits (`REGION_VIEW` of
 * `apps/web-angular/src/app/features/map/data/boundaries.ts`, [south, west] then [north, east]).
 * A jest test compares the two tables.
 */
const REGION_VIEW = {
  'americas-north': [
    [8, -168],
    [72, -52],
  ],
  'americas-south': [
    [-56, -92],
    [13, -34],
  ],
  europe: [
    [34, -25],
    [71, 42],
  ],
};

/** Mercator ordinate of a parallel, in the unit of longitude degrees (0 at the equator). */
function mercatorDegrees(latitude) {
  const clipped = Math.max(-MERCATOR_LIMIT_DEGREES, Math.min(MERCATOR_LIMIT_DEGREES, latitude));
  return Math.log(Math.tan(Math.PI / 4 + (clipped * RADIANS) / 2)) / RADIANS;
}

/** Every polygon of a feature as a list of rings (a Polygon is one polygon). */
function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates;
  }
  throw new Error(`Unsupported geometry ${geometry.type}`);
}

/** West, south, east and north limits of a feature collection, in degrees. */
function extentOf(features) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const feature of features) {
    for (const polygon of polygonsOf(feature.geometry)) {
      for (const ring of polygon) {
        for (const [longitude, latitude] of ring) {
          west = Math.min(west, longitude);
          east = Math.max(east, longitude);
          south = Math.min(south, latitude);
          north = Math.max(north, latitude);
        }
      }
    }
  }
  return { west, south, east, north };
}

/**
 * The projection of one region: degrees to whole drawing units, x to the east and y to the south
 * from the north-west corner of the region's extent.
 */
function createProjection(extent) {
  const top = mercatorDegrees(extent.north);
  const x = (longitude) => Math.round((longitude - extent.west) * UNITS_PER_DEGREE);
  const y = (latitude) => Math.round((top - mercatorDegrees(latitude)) * UNITS_PER_DEGREE);
  return {
    x,
    y,
    point: ([longitude, latitude]) => [x(longitude), y(latitude)],
    width: x(extent.east),
    height: y(extent.south),
  };
}

/**
 * A ring in drawing units: the closing point of GeoJSON and points that fall on the same unit
 * are dropped. Null when fewer than three points remain (nothing to fill).
 */
function projectRing(ring, projection) {
  const points = [];
  for (const position of ring) {
    const point = projection.point(position);
    const last = points[points.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) {
      points.push(point);
    }
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    points.pop();
  }
  return points.length >= 3 ? points : null;
}

/** SVG path data of one closed ring: an absolute start, then steps relative to the last point. */
function ringPath(points) {
  let previous = points[0];
  let path = `M${previous[0]} ${previous[1]}l`;
  for (let index = 1; index < points.length; index++) {
    const point = points[index];
    path += `${index > 1 ? ' ' : ''}${point[0] - previous[0]} ${point[1] - previous[1]}`;
    previous = point;
  }
  return `${path}z`;
}

/** The rings of a feature in drawing units (collapsed rings left out). */
function projectFeature(feature, projection) {
  const rings = [];
  for (const polygon of polygonsOf(feature.geometry)) {
    for (const ring of polygon) {
      const points = projectRing(ring, projection);
      if (points) {
        rings.push(points);
      }
    }
  }
  return rings;
}

function boxOf(rings) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return [left, top, right, bottom];
}

/**
 * The drawing of one region.
 *
 * - `width`, `height`: the size of the drawing, in units.
 * - `home`: the window shown first, `[x, y, width, height]` (the view the web map fits).
 * - `outline`: every country border as one path.
 * - `shapes`: one entry per state or province, by code: its path and its box
 *   `[left, top, right, bottom]` (the box narrows a touch down to a few shapes).
 */
function buildRegionOutline(region, collection) {
  const view = REGION_VIEW[region];
  if (!view) {
    throw new Error(`No first view for the region ${region}`);
  }
  const projection = createProjection(extentOf(collection.features));
  const clampX = (value) => Math.max(0, Math.min(projection.width, value));
  const clampY = (value) => Math.max(0, Math.min(projection.height, value));
  const [[south, west], [north, east]] = view;
  const left = clampX(projection.x(west));
  const top = clampY(projection.y(north));
  const home = [left, top, clampX(projection.x(east)) - left, clampY(projection.y(south)) - top];

  const shapes = [];
  let outline = '';
  let rings = 0;
  let points = 0;
  const seen = new Set();
  for (const feature of collection.features) {
    const projected = projectFeature(feature, projection);
    if (projected.length === 0) {
      continue;
    }
    const path = projected.map(ringPath).join('');
    if (feature.properties.kind === 'country') {
      outline += path;
    } else if (feature.properties.kind === 'subdivision' && feature.properties.code) {
      const code = feature.properties.code;
      if (seen.has(code)) {
        throw new Error(`${region}: the code ${code} is drawn twice`);
      }
      seen.add(code);
      shapes.push({ code, box: boxOf(projected), d: path });
    } else {
      throw new Error(`${region}: a feature is neither a country nor a coded subdivision`);
    }
    rings += projected.length;
    points += projected.reduce((sum, ring) => sum + ring.length, 0);
  }
  shapes.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return {
    outline: {
      region,
      width: projection.width,
      height: projection.height,
      home,
      outline,
      shapes,
    },
    stats: { shapes: shapes.length, rings, points },
  };
}

/** The file the app bundles: one line per shape, so a change of the source reads as a diff. */
function renderRegionOutline(outline) {
  const head = [
    `"region": ${JSON.stringify(outline.region)}`,
    `"width": ${outline.width}`,
    `"height": ${outline.height}`,
    `"home": ${JSON.stringify(outline.home)}`,
    `"outline": ${JSON.stringify(outline.outline)}`,
  ];
  const shapes = outline.shapes.map((shape) => `    ${JSON.stringify(shape)}`);
  return `{\n  ${head.join(',\n  ')},\n  "shapes": [\n${shapes.join(',\n')}\n  ]\n}\n`;
}

module.exports = {
  MERCATOR_LIMIT_DEGREES,
  REGION_VIEW,
  UNITS_PER_DEGREE,
  buildRegionOutline,
  createProjection,
  extentOf,
  mercatorDegrees,
  projectRing,
  renderRegionOutline,
  ringPath,
};
