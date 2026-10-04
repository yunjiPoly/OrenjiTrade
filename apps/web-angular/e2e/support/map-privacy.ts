import { Locator, Page, expect } from '@playwright/test';

/**
 * Browser-side checks of ADR 0004 "Client rendering" for collector maps (Leaflet adapter, the
 * default without a Google key): the map never shows more than zoom 14, whatever the input; every
 * collector is a zone 3 km wide (radius 1500 m) around the public point, with the avatar centred
 * on it; and no DOM attribute carries a coordinate finer than the API's 3 decimals.
 */

/** COLLECTOR_MAP_MAX_ZOOM of src/app/shared/map/approximate-area.ts. */
export const COLLECTOR_MAP_MAX_ZOOM = 14;
/** APPROXIMATE_AREA_RADIUS_M of src/app/shared/map/approximate-area.ts (3 km wide zones). */
export const APPROXIMATE_AREA_RADIUS_M = 1500;

/** Web Mercator size of `metres` in screen pixels at `latitude` and `zoom` (256 px tiles). */
export function metresToPixels(
  metres: number,
  latitude: number,
  zoom = COLLECTOR_MAP_MAX_ZOOM,
): number {
  const metresPerPixel =
    (2 * Math.PI * 6378137 * Math.cos((latitude * Math.PI) / 180)) / (256 * 2 ** zoom);
  return metres / metresPerPixel;
}

/**
 * Tries every way to zoom in past the cap on the map `container`: the scroll wheel over `anchor`
 * (a collector's marker, which therefore stays in view), then the "+" button, the keyboard ("+",
 * "=", numpad "+") and double clicks next to the anchor.
 */
export async function tryToZoomPastTheCap(
  page: Page,
  container: Locator,
  anchor: Locator,
): Promise<void> {
  const settle = () => page.waitForTimeout(400); // zoom animations and Leaflet's wheel debounce
  for (let i = 0; i < 6; i++) {
    const { x, y } = await centreOf(anchor);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -600);
    await settle();
  }
  const zoomIn = container.getByRole('button', { name: 'Zoom in' });
  for (let i = 0; i < 4; i++) {
    if ((await zoomIn.getAttribute('aria-disabled')) === 'true') {
      break;
    }
    await zoomIn.click();
    await settle();
  }
  // Leaflet's keyboard handler zooms in on "+" / "=" while the map container has the focus.
  await container.evaluate((element) => {
    const map = element.classList.contains('leaflet-container')
      ? element
      : element.querySelector('.leaflet-container');
    (map as HTMLElement | null)?.focus();
  });
  for (const key of ['Equal', 'Shift+Equal', 'NumpadAdd']) {
    await page.keyboard.press(key);
    await settle();
  }
  const { x, y } = await centreOf(anchor);
  await page.mouse.dblclick(x + 60, y);
  await settle();
  await page.mouse.dblclick(x, y + 60);
  await settle();
}

/** Zoom levels of the map tiles currently in the DOM (`.../{z}/{x}/{y}.png`). */
export async function tileZooms(container: Locator): Promise<number[]> {
  const sources = await container
    .locator('img.leaflet-tile')
    .evaluateAll((images) => images.map((image) => image.getAttribute('src') ?? ''));
  return sources
    .map((src) => /\/(\d+)\/\d+\/\d+\.png/.exec(src)?.[1])
    .filter((z): z is string => z !== undefined)
    .map(Number);
}

export interface DrawnCircle {
  /** Radius in screen pixels (Leaflet draws `a r,r` arcs). */
  radiusPx: number;
  /** Centre in page coordinates. */
  cx: number;
  cy: number;
}

/** The circles of the map's overlay pane (search radius and collectors' zones). */
export async function drawnCircles(container: Locator): Promise<DrawnCircle[]> {
  return container.locator('.leaflet-overlay-pane path').evaluateAll((paths) =>
    paths.flatMap((path) => {
      const match = /a(\d+(?:\.\d+)?),/.exec(path.getAttribute('d') ?? '');
      if (!match) {
        return [];
      }
      const box = path.getBoundingClientRect();
      return [
        { radiusPx: Number(match[1]), cx: box.x + box.width / 2, cy: box.y + box.height / 2 },
      ];
    }),
  );
}

/** Centre of an element's box in page coordinates. */
export async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  expect(box, 'element on screen').toBeTruthy();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

export interface DomCoordinateFinding {
  element: string;
  attribute: string;
  value: string;
}

/**
 * Every DOM attribute of the page holding a number in coordinate range (-180..180) with more than
 * 3 decimals. Purely geometric attributes (inline styles, SVG path data and transforms, which hold
 * screen pixels) are skipped; everything else (aria labels, titles, data-*, href, src, value, ...)
 * is checked. Returns the findings and how many attributes were scanned.
 */
export async function domCoordinateFindings(
  page: Page,
): Promise<{ findings: DomCoordinateFinding[]; scanned: number }> {
  return page.evaluate(() => {
    const geometric = new Set([
      'style',
      'd',
      'transform',
      'points',
      'viewbox',
      'width',
      'height',
      'x',
      'y',
      'cx',
      'cy',
      'r',
      'stroke-width',
      'stroke-opacity',
      'stroke-dasharray',
      'fill-opacity',
      'opacity',
    ]);
    const findings: { element: string; attribute: string; value: string }[] = [];
    let scanned = 0;
    for (const element of Array.from(document.querySelectorAll('*'))) {
      for (const attribute of Array.from(element.attributes)) {
        if (geometric.has(attribute.name.toLowerCase())) {
          continue;
        }
        scanned++;
        for (const match of attribute.value.matchAll(/-?\d{1,3}\.(\d{4,})/g)) {
          if (Math.abs(Number(match[0])) <= 180) {
            findings.push({
              element: element.tagName.toLowerCase(),
              attribute: attribute.name,
              value: attribute.value.slice(0, 120),
            });
            break;
          }
        }
      }
    }
    return { findings, scanned };
  });
}
