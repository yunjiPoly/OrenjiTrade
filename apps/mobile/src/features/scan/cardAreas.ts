/**
 * Where the scan reads a Yu-Gi-Oh! card (owner spec 2026-10-15, section 3.3), in ONE place so the
 * real-card check (section 7) can correct the numbers. Every area is given in fractions of the card
 * (0 = its left or top edge, 1 = its right or bottom edge), from the owner's coordinates on a
 * 421 × 614 card.
 */

/** Edges of an area, in fractions of the card. */
export interface CardArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A Yu-Gi-Oh! card is 59 × 86 mm: the camera's frame has this width / height ratio. */
export const CARD_WIDTH_MM = 59;
export const CARD_HEIGHT_MM = 86;
export const CARD_ASPECT_RATIO = CARD_WIDTH_MM / CARD_HEIGHT_MM;

/** The card name: x 4–86 %, y 2–11 % (the owner's 15–360 × 10–65). */
export const NAME_AREA: CardArea = { left: 0.04, top: 0.02, right: 0.86, bottom: 0.11 };

/**
 * The set code, at the right under the artwork: x 69–96 %, y 71–76 % (the owner's
 * 290–405 × 435–465).
 */
export const SET_CODE_AREA: CardArea = { left: 0.69, top: 0.71, right: 0.96, bottom: 0.76 };

/**
 * The second spot, read only when the set code area holds no code: Pendulum cards print the code
 * at the left, under the pendulum text. No other card type gets a second spot (the owner's call).
 */
export const PENDULUM_SET_CODE_AREA: CardArea = { left: 0.04, top: 0.7, right: 0.45, bottom: 0.8 };

/**
 * Margin added on each side of an area before it is cropped, as a share of that area's own width
 * and height ("about 10 %"). The crop never leaves the photo.
 */
export const AREA_MARGIN = 0.1;

/** The set code is tiny: its crop is read at twice its size. */
export const SET_CODE_READ_SCALE = 2;
/** The name is read at its size. */
export const NAME_READ_SCALE = 1;
