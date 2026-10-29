import { Page, expect } from '@playwright/test';

/**
 * A visible point of a state's shape on the map: one where the shape itself is the element under
 * the pointer (not an overlay, a legend or another shape), or null. Never a coordinate of the
 * state: a pixel of the page.
 */
async function visiblePoint(page: Page, code: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((wanted) => {
    const path = document.querySelector(`.leaflet-overlay-pane path[data-code="${wanted}"]`);
    const map = document.querySelector('[data-testid="boundary-map"]');
    if (!path || !map) {
      return null;
    }
    const box = path.getBoundingClientRect();
    const view = map.getBoundingClientRect();
    const left = Math.max(box.left, view.left, 0);
    const right = Math.min(box.right, view.right, window.innerWidth);
    const top = Math.max(box.top, view.top, 0);
    const bottom = Math.min(box.bottom, view.bottom, window.innerHeight);
    if (right <= left || bottom <= top) {
      return null;
    }
    for (let i = 1; i < 24; i++) {
      for (let j = 1; j < 24; j++) {
        const x = left + ((right - left) * i) / 24;
        const y = top + ((bottom - top) * j) / 24;
        if (document.elementFromPoint(x, y) === path) {
          return { x, y };
        }
      }
    }
    return null;
  }, code);
}

/** Finds a visible point of the state, zooming the map out (its own "Zoom out") until one shows. */
export async function statePoint(page: Page, code: string): Promise<{ x: number; y: number }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const point = await visiblePoint(page, code);
    if (point) {
      return point;
    }
    await page.getByRole('button', { name: 'Zoom out' }).first().click();
    await page.waitForTimeout(400);
  }
  const point = await visiblePoint(page, code);
  expect(point, `a visible point of ${code} on the map`).not.toBeNull();
  return point!;
}

/**
 * A real mouse click on a state (moving over another state first, as a hand does): never a
 * synthetic `dispatchEvent`, which hid that a hover re-ordering the shapes swallowed every click.
 */
export async function clickState(page: Page, code: string, from?: string): Promise<void> {
  if (from) {
    const start = await statePoint(page, from);
    await page.mouse.move(start.x, start.y, { steps: 4 });
  }
  const point = await statePoint(page, code);
  await page.mouse.move(point.x, point.y, { steps: 6 });
  await page.mouse.click(point.x, point.y);
}
