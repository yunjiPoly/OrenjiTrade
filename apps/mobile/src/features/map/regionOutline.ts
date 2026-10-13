/**
 * The bundled drawings of the region map (ADR 0017): one file per platform region under
 * `assets/boundaries/`, made from the web app's boundary files by `npm run sync:boundaries`
 * (`scripts/lib/boundaryOutlines.js`). They are files of the app: no map provider, no tile, no
 * request, and nothing in them is a collector's place.
 *
 * A drawing is in whole drawing units, x to the right and y down from its top-left corner, already
 * projected: the app never sees a degree.
 */

import { OUTLINE_FILES } from './outlineFiles';

/** One state or province: its code, its box `[left, top, right, bottom]` and its SVG path. */
export interface RegionShape {
  code: string;
  box: readonly number[];
  d: string;
}

export interface RegionOutline {
  region: string;
  /** Size of the drawing, in units. */
  width: number;
  height: number;
  /** The window shown first, `[x, y, width, height]`. */
  home: readonly number[];
  /** Every country border, as one path. */
  outline: string;
  /** The states and provinces, by code. */
  shapes: readonly RegionShape[];
}

const loaded = new Map<string, Promise<RegionOutline>>();

/** True when the app ships a drawing for this region. */
export function hasRegionOutline(region: string): boolean {
  return Object.prototype.hasOwnProperty.call(OUTLINE_FILES, region);
}

/** The drawing of a region, loaded once and only when that region is shown. */
export function loadRegionOutline(region: string): Promise<RegionOutline> {
  const known = loaded.get(region);
  if (known) {
    return known;
  }
  const read = hasRegionOutline(region) ? OUTLINE_FILES[region] : undefined;
  if (!read) {
    return Promise.reject(new Error(`No drawing for the region ${region}`));
  }
  const pending = read();
  loaded.set(region, pending);
  // A failed load can be tried again.
  pending.catch(() => loaded.delete(region));
  return pending;
}

/** The path of every state and province as one: the map draws them all with a single element. */
export function meshPath(outline: RegionOutline): string {
  return outline.shapes.map((shape) => shape.d).join('');
}

/** Rings of a path, each a flat list `[x0, y0, x1, y1, ...]` in drawing units. */
export type Rings = readonly (readonly number[])[];

const parsed = new WeakMap<RegionShape, Rings>();

/**
 * Reads the path data the sync script writes: closed rings, each `M x y l dx dy dx dy ... z`
 * (an absolute start, then steps relative to the last point).
 */
export function ringsOfPath(d: string): Rings {
  const rings: number[][] = [];
  for (const part of d.split('z')) {
    const numbers = part.match(/-?\d+/g);
    if (!numbers || numbers.length < 2) {
      continue;
    }
    let x = Number(numbers[0]);
    let y = Number(numbers[1]);
    const ring = [x, y];
    for (let index = 2; index + 1 < numbers.length; index += 2) {
      x += Number(numbers[index]);
      y += Number(numbers[index + 1]);
      ring.push(x, y);
    }
    rings.push(ring);
  }
  return rings;
}

/** The rings of a shape, read once. */
export function ringsOf(shape: RegionShape): Rings {
  let rings = parsed.get(shape);
  if (!rings) {
    rings = ringsOfPath(shape.d);
    parsed.set(shape, rings);
  }
  return rings;
}

/** Even-odd test over every ring of a shape: islands count, holes do not. */
export function ringsContain(rings: Rings, x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    const length = ring.length;
    for (let i = 0, j = length - 2; i < length; j = i, i += 2) {
      const xi = ring[i] ?? 0;
      const yi = ring[i + 1] ?? 0;
      const xj = ring[j] ?? 0;
      const yj = ring[j + 1] ?? 0;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Squared gap between a point and the closest border of a shape. */
function squaredGap(rings: Rings, x: number, y: number): number {
  let best = Infinity;
  for (const ring of rings) {
    const length = ring.length;
    for (let i = 0, j = length - 2; i < length; j = i, i += 2) {
      const ax = ring[j] ?? 0;
      const ay = ring[j + 1] ?? 0;
      const bx = ring[i] ?? 0;
      const by = ring[i + 1] ?? 0;
      const dx = bx - ax;
      const dy = by - ay;
      const span = dx * dx + dy * dy;
      const t = span === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / span));
      const gx = x - (ax + t * dx);
      const gy = y - (ay + t * dy);
      best = Math.min(best, gx * gx + gy * gy);
    }
  }
  return best;
}

/**
 * The state or province under a point of the drawing, or the closest one within `reach` units (a
 * finger is wider than a small state; the map passes about ten points of the screen). Null over
 * the sea.
 */
export function shapeAt(outline: RegionOutline, x: number, y: number, reach = 0): string | null {
  let closest: string | null = null;
  let closestGap = reach * reach;
  for (const shape of outline.shapes) {
    const [left = 0, top = 0, right = 0, bottom = 0] = shape.box;
    if (x < left - reach || x > right + reach || y < top - reach || y > bottom + reach) {
      continue;
    }
    const rings = ringsOf(shape);
    if (ringsContain(rings, x, y)) {
      return shape.code;
    }
    if (reach > 0) {
      const gap = squaredGap(rings, x, y);
      if (gap <= closestGap) {
        closestGap = gap;
        closest = shape.code;
      }
    }
  }
  return closest;
}
