import type { RegionOutline } from './regionOutline';

/**
 * The part of a region's drawing the map shows, and how panning and zooming move it. Pure
 * arithmetic on drawing units and screen points (no renderer), so the gestures, the zoom buttons
 * and the tests all go through the same functions.
 */

/** A rectangle of the drawing, in drawing units. */
export interface MapWindow {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The size of the map on screen, in points. */
export interface MapSize {
  width: number;
  height: number;
}

/** How far the map zooms in: a state a few points wide at first fills a thumb at this zoom. */
export const MAX_MAP_ZOOM = 16;
/** One press of a zoom button. */
export const ZOOM_STEP = 2;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Keeps a window on the drawing: inside it along an axis where it fits, centred on it along an
 * axis where it is larger (a tall region in a wide frame).
 */
export function settleWindow(window: MapWindow, outline: RegionOutline): MapWindow {
  const along = (start: number, length: number, total: number) =>
    length >= total ? (total - length) / 2 : clamp(start, 0, total - length);
  return {
    x: along(window.x, window.width, outline.width),
    y: along(window.y, window.height, outline.height),
    width: window.width,
    height: window.height,
  };
}

/**
 * The window at zoom 1: the region's first view (the one the web map fits), grown along one axis
 * to the shape of the frame so nothing of it is cut.
 */
export function baseWindow(outline: RegionOutline, size: MapSize): MapWindow {
  const [homeX = 0, homeY = 0, homeWidth = outline.width, homeHeight = outline.height] =
    outline.home;
  const aspect = size.width / size.height;
  const width = homeWidth / homeHeight < aspect ? homeHeight * aspect : homeWidth;
  const height = homeWidth / homeHeight < aspect ? homeHeight : homeWidth / aspect;
  return settleWindow(
    { x: homeX + (homeWidth - width) / 2, y: homeY + (homeHeight - height) / 2, width, height },
    outline
  );
}

/** The map is never shorter than this (in points): a region stays readable in it. */
export const MIN_MAP_HEIGHT = 240;
/** Nor taller: the zoom buttons stay within a thumb's reach. */
export const MAX_MAP_HEIGHT = 520;
/** What the page keeps under the map for the first line of the legend: the page plainly goes on. */
export const UNDER_MAP = 48;

/**
 * The height of the map's frame: what the page has left under what stands above the map (the
 * region switcher, the title, a prompt, the Map | List switch) and the gap after it, so the whole
 * map and its zoom buttons are on screen without scrolling whenever the screen allows it. When so
 * little is left that the map would be unreadable (a small phone, the largest text sizes) it
 * keeps its minimum and the page scrolls.
 */
export function mapFrameHeight(pageHeight: number, aboveMap: number): number {
  return Math.round(
    Math.max(MIN_MAP_HEIGHT, Math.min(MAX_MAP_HEIGHT, pageHeight - aboveMap - UNDER_MAP))
  );
}

/**
 * True when the map shows more than its first view: a finger then moves the map. While the whole
 * region is on screen there is nothing to move, and a finger scrolls the page instead.
 */
export function isZoomedIn(window: MapWindow, base: MapWindow): boolean {
  return zoomOf(window, base) > 1.01;
}

/** 1 when the whole first view shows, up to `MAX_MAP_ZOOM`. */
export function zoomOf(window: MapWindow, base: MapWindow): number {
  return base.width / window.width;
}

/**
 * Zooms by `factor` (above 1: in) between zoom 1 and the maximum. The point of the drawing under
 * `focus` (fractions of the frame; its centre by default) stays under it.
 */
export function zoomWindow(
  window: MapWindow,
  base: MapWindow,
  outline: RegionOutline,
  factor: number,
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 }
): MapWindow {
  const zoom = clamp(zoomOf(window, base) * factor, 1, MAX_MAP_ZOOM);
  const width = base.width / zoom;
  const height = base.height / zoom;
  return settleWindow(
    {
      x: window.x + focus.x * (window.width - width),
      y: window.y + focus.y * (window.height - height),
      width,
      height,
    },
    outline
  );
}

/** Moves the drawing with the finger by `dx`, `dy` screen points. */
export function panWindow(
  window: MapWindow,
  outline: RegionOutline,
  size: MapSize,
  dx: number,
  dy: number
): MapWindow {
  return settleWindow(
    {
      ...window,
      x: window.x - (dx * window.width) / size.width,
      y: window.y - (dy * window.height) / size.height,
    },
    outline
  );
}

/** Drawing units under one screen point. */
export function unitsPerPoint(window: MapWindow, size: MapSize): number {
  return window.width / size.width;
}

/** The point of the drawing under a point of the frame. */
export function pointToUnits(
  window: MapWindow,
  size: MapSize,
  x: number,
  y: number
): { x: number; y: number } {
  return {
    x: window.x + (x * window.width) / size.width,
    y: window.y + (y * window.height) / size.height,
  };
}

/** SVG `viewBox` of a window. */
export function viewBoxOf(window: MapWindow): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return `${round(window.x)} ${round(window.y)} ${round(window.width)} ${round(window.height)}`;
}

/**
 * How to move the picture drawn for `drawn` so that it shows `live` while a gesture lasts: the
 * map is redrawn once, when the fingers lift, and only slid and scaled in between (no path is
 * drawn during a gesture, whatever the number of shapes). The values suit a React Native
 * `transform` (`translateX`, `translateY`, then `scale`), which scales about the centre.
 */
export function liveTransform(
  drawn: MapWindow,
  live: MapWindow,
  size: MapSize
): { scale: number; translateX: number; translateY: number } {
  const scale = drawn.width / live.width;
  return {
    scale,
    translateX: ((drawn.x - live.x) * size.width) / live.width + ((scale - 1) * size.width) / 2,
    translateY: ((drawn.y - live.y) * size.height) / live.height + ((scale - 1) * size.height) / 2,
  };
}

/** True when two windows show the same thing (to the hundredth of a unit). */
export function sameWindow(a: MapWindow, b: MapWindow): boolean {
  const same = (first: number, second: number) => Math.abs(first - second) < 0.01;
  return same(a.x, b.x) && same(a.y, b.y) && same(a.width, b.width) && same(a.height, b.height);
}

/** How much room a focused state or province leaves around it: the box spans 1 / this. */
export const FOCUS_MARGIN = 2.2;
/** Where the focused place sits from the top (a fraction): the state card covers the bottom. */
export const FOCUS_TOP = 0.42;

/**
 * The window on one state or province (its box `[left, top, right, bottom]`, drawing units): the
 * map's "My province" and its first view (owner spec 2026-10-14, section 8: "The map opens
 * centred on your province"), zoomed so the place spans about half of the frame, never out
 * beyond the whole region nor in beyond the maximum zoom, a little above the middle.
 */
export function focusWindow(
  base: MapWindow,
  outline: RegionOutline,
  box: readonly number[]
): MapWindow {
  const [left = 0, top = 0, right = 0, bottom = 0] = box;
  const wanted = Math.max(right - left, ((bottom - top) * base.width) / base.height) * FOCUS_MARGIN;
  const width = clamp(wanted, base.width / MAX_MAP_ZOOM, base.width);
  const height = (width * base.height) / base.width;
  const centreX = (left + right) / 2;
  const centreY = (top + bottom) / 2;
  return settleWindow(
    { x: centreX - width / 2, y: centreY - height * FOCUS_TOP, width, height },
    outline
  );
}
