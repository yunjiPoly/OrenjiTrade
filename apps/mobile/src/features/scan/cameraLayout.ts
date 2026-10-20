import { CARD_ASPECT_RATIO } from './cardAreas';
import type { ViewRect } from './frameMapping';

/** The frame takes at most this share of the screen's width (the mockup's 258 of 390 points). */
export const FRAME_WIDTH_SHARE = 258 / 390;
/** Room kept above and below the frame inside its slot, in points. */
export const FRAME_SLOT_PADDING = 8;

/**
 * The card-shaped frame (59 × 86 mm) inside the space the camera screen leaves it between its top
 * bar and its hint: as tall as that space allows, never wider than the mockup's share of the
 * screen, centred. Null while the space is unknown or too small for a frame.
 */
export function fitCardFrame(slot: ViewRect, screenWidth: number): ViewRect | null {
  const maxWidth = Math.min(slot.width, screenWidth * FRAME_WIDTH_SHARE);
  const maxHeight = slot.height - FRAME_SLOT_PADDING * 2;
  if (!(maxWidth > 0) || !(maxHeight > 0)) {
    return null;
  }
  let height = maxHeight;
  let width = height * CARD_ASPECT_RATIO;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / CARD_ASPECT_RATIO;
  }
  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height,
  };
}
