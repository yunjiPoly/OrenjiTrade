import type { BoundaryCollection, BoundaryFeature } from '../map/data/boundaries';
import { REGION_VIEW, ShadeLevel, shadeLevel } from '../map/data/boundaries';

/**
 * Home's map card (spec 5.3): a static, pre-shaded SVG of the bundled Natural Earth boundaries of
 * the browsed region, drawn without Leaflet (Leaflet stays in the Search chunk, spec 21). Shapes
 * are projected (Web Mercator, as Search's map) into the card's pixels and rounded to a tenth of
 * a pixel: the page carries drawing coordinates only, never a place's position.
 */

/** The card's drawing size (spec 5.3: 280×168). */
export const MAP_CARD_SIZE = { width: 280, height: 168 } as const;

export interface StaticShape {
  /** ISO 3166-2 code of a state or province; absent on a country outline. */
  code: string | null;
  d: string;
  level: ShadeLevel;
}

export interface StaticMap {
  shapes: StaticShape[];
  /** The outline of the viewer's province (teal, dashed), drawn above the shapes. */
  home: string | null;
}

type Ring = [number, number][];


/** Web Mercator in [0, 1] (x east, y south). */
function project([lng, lat]: [number, number]): [number, number] {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return [(lng + 180) / 360, (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2];
}

function ringsOf(feature: BoundaryFeature): Ring[] {
  const coordinates = feature.geometry.coordinates as unknown;
  if (feature.geometry.type === 'Polygon') {
    return coordinates as Ring[];
  }
  return (coordinates as Ring[][]).flat();
}

interface View {
  minX: number;
  minY: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** A view that fits these projected bounds into the card, centred, keeping the aspect. */
function fit(minX: number, minY: number, maxX: number, maxY: number, pad: number): View {
  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);
  const padX = width * pad;
  const padY = height * pad;
  const x0 = minX - padX;
  const y0 = minY - padY;
  const w = width + 2 * padX;
  const h = height + 2 * padY;
  const scale = Math.min(MAP_CARD_SIZE.width / w, MAP_CARD_SIZE.height / h);
  return {
    minX: x0,
    minY: y0,
    scale,
    offsetX: (MAP_CARD_SIZE.width - w * scale) / 2,
    offsetY: (MAP_CARD_SIZE.height - h * scale) / 2,
  };
}

function boundsOf(rings: readonly Ring[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const point of ring) {
      const [x, y] = project(point);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

/** An SVG path of these rings in the view, points closer than half a pixel dropped. */
export function pathOf(rings: readonly Ring[], view: View): string {
  const parts: string[] = [];
  for (const ring of rings) {
    let last: [number, number] | null = null;
    const points: string[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of ring) {
      const [px, py] = project(point);
      const x = Math.round(((px - view.minX) * view.scale + view.offsetX) * 10) / 10;
      const y = Math.round(((py - view.minY) * view.scale + view.offsetY) * 10) / 10;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (last && Math.abs(last[0] - x) < 0.5 && Math.abs(last[1] - y) < 0.5) {
        continue;
      }
      last = [x, y];
      points.push(`${x} ${y}`);
    }
    // A ring whose box misses the card draws nothing.
    const onCard =
      maxX > 0 && minX < MAP_CARD_SIZE.width && maxY > 0 && minY < MAP_CARD_SIZE.height;
    if (onCard && points.length >= 3) {
      parts.push(`M${points.join('L')}Z`);
    }
  }
  return parts.join('');
}

/**
 * The card's drawing: the viewer's province and its neighbours when it is in this region (as
 * Search's map opens, spec 6.4), else the whole region; every state shaded by its binder count.
 */
export function staticMap(
  collection: BoundaryCollection,
  region: string,
  counts: ReadonlyMap<string, number>,
  home: string | null,
): StaticMap {
  const subdivisions = collection.features.filter(
    (feature) => feature.properties.kind === 'subdivision' && feature.properties.code,
  );
  const homeFeatures = home
    ? subdivisions.filter((feature) => feature.properties.code === home)
    : [];
  let view: View;
  if (homeFeatures.length > 0) {
    const [minX, minY, maxX, maxY] = boundsOf(homeFeatures.flatMap(ringsOf));
    view = fit(minX, minY, maxX, maxY, 0.35);
  } else {
    const box = REGION_VIEW[region] ?? REGION_VIEW['americas-north'];
    const [[south, west], [north, east]] = box;
    const [minX, maxY] = project([west, south]);
    const [maxX, minY] = project([east, north]);
    view = fit(minX, minY, maxX, maxY, 0);
  }
  const shapes: StaticShape[] = subdivisions.map((feature) => {
    const code = feature.properties.code ?? null;
    return {
      code,
      d: pathOf(ringsOf(feature), view),
      level: shadeLevel(code ? counts.get(code) : undefined),
    };
  });
  const homePath = homeFeatures.length > 0 ? pathOf(homeFeatures.flatMap(ringsOf), view) : null;
  return { shapes: shapes.filter((shape) => shape.d !== ''), home: homePath };
}
