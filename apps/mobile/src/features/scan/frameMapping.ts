import {
  AREA_MARGIN,
  NAME_AREA,
  PENDULUM_SET_CODE_AREA,
  SET_CODE_AREA,
  type CardArea,
} from './cardAreas';
import type { PixelRect } from './ocr/types';

/**
 * From the card-shaped frame on the camera screen to rectangles of the photo (spec 3.2).
 *
 * The preview fills the screen ("cover"): the camera's picture is scaled by the larger of the two
 * ratios and centred, and whatever overflows is cut, so the preview shows only part of the photo.
 * A point of the preview maps to the photo through the same scaling. The photo is upright, as the
 * camera hands it over (the app is held in portrait); a photo whose orientation differs from the
 * preview's cannot be placed under the frame, and is read whole instead.
 *
 * The collector fits the card in the frame: the card is taken to fill the frame, touching each of
 * its edges.
 */

export interface Size {
  width: number;
  height: number;
}

/** A rectangle of the preview, in points, from the preview's top left corner. */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The photo pixel rectangles the scan reads on one card. */
export interface CardCrops {
  name: PixelRect;
  setCode: PixelRect;
  pendulumSetCode: PixelRect;
}

type Orientation = 'portrait' | 'landscape' | 'square';

function orientationOf(size: Size): Orientation {
  if (size.width === size.height) {
    return 'square';
  }
  return size.width > size.height ? 'landscape' : 'portrait';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isUsable(size: Size): boolean {
  return (
    Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
  );
}

/** Whether the photo can be placed under the preview (same orientation, or one is square). */
export function sameOrientation(preview: Size, photo: Size): boolean {
  const a = orientationOf(preview);
  const b = orientationOf(photo);
  return a === 'square' || b === 'square' || a === b;
}

/**
 * The cover scaling: how many preview points one photo pixel takes, and where the photo's top left
 * corner sits in the preview (zero or negative: the part that is cut).
 */
export function coverScaling(
  preview: Size,
  photo: Size
): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.max(preview.width / photo.width, preview.height / photo.height);
  return {
    scale,
    offsetX: (preview.width - photo.width * scale) / 2,
    offsetY: (preview.height - photo.height * scale) / 2,
  };
}

/**
 * The photo pixels under a rectangle of the preview (fractional), or null when the sizes are
 * unusable, the orientations differ, or nothing of the rectangle is on the photo. The rectangle is
 * kept inside the photo unless `clip` is false: a card's rectangle keeps its shape, so its areas
 * stay where they are on the card (each crop is then kept inside the photo on its own).
 */
export function previewRectToPhoto(
  rect: ViewRect,
  preview: Size,
  photo: Size,
  { clip = true }: { clip?: boolean } = {}
): PixelRect | null {
  if (!isUsable(preview) || !isUsable(photo) || !(rect.width > 0) || !(rect.height > 0)) {
    return null;
  }
  if (!sameOrientation(preview, photo)) {
    return null;
  }
  const { scale, offsetX, offsetY } = coverScaling(preview, photo);
  const x0 = (rect.x - offsetX) / scale;
  const y0 = (rect.y - offsetY) / scale;
  const x1 = (rect.x + rect.width - offsetX) / scale;
  const y1 = (rect.y + rect.height - offsetY) / scale;
  const left = Math.max(0, x0);
  const top = Math.max(0, y0);
  const right = Math.min(photo.width, x1);
  const bottom = Math.min(photo.height, y1);
  if (right <= left || bottom <= top) {
    return null;
  }
  return clip
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * One area of the card in whole photo pixels: the area's edges on the card, widened by `margin` of
 * the area's own width and height on each side, rounded outwards and kept inside the photo.
 */
export function areaInPhoto(
  card: PixelRect,
  area: CardArea,
  photo: Size,
  margin: number = AREA_MARGIN
): PixelRect {
  const x0 = card.x + area.left * card.width;
  const x1 = card.x + area.right * card.width;
  const y0 = card.y + area.top * card.height;
  const y1 = card.y + area.bottom * card.height;
  const marginX = (x1 - x0) * margin;
  const marginY = (y1 - y0) * margin;
  const left = clamp(Math.floor(x0 - marginX), 0, photo.width);
  const top = clamp(Math.floor(y0 - marginY), 0, photo.height);
  const right = clamp(Math.ceil(x1 + marginX), 0, photo.width);
  const bottom = clamp(Math.ceil(y1 + marginY), 0, photo.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** The name, set code and Pendulum spot crops of a card that fills `card` in the photo. */
export function cardCrops(card: PixelRect, photo: Size, margin: number = AREA_MARGIN): CardCrops {
  return {
    name: areaInPhoto(card, NAME_AREA, photo, margin),
    setCode: areaInPhoto(card, SET_CODE_AREA, photo, margin),
    pendulumSetCode: areaInPhoto(card, PENDULUM_SET_CODE_AREA, photo, margin),
  };
}

/**
 * The crops of a camera photo, from the frame on screen: null when the frame cannot be placed on
 * the photo, or when an area of the card is off the photo (the photo is then read whole).
 */
export function cropsUnderFrame(frame: ViewRect, preview: Size, photo: Size): CardCrops | null {
  const card = previewRectToPhoto(frame, preview, photo, { clip: false });
  if (!card) {
    return null;
  }
  const crops = cardCrops(card, photo);
  const empty = [crops.name, crops.setCode, crops.pendulumSetCode].some(
    (crop) => crop.width === 0 || crop.height === 0
  );
  return empty ? null : crops;
}
