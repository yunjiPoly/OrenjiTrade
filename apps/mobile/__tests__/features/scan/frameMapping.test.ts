import {
  AREA_MARGIN,
  CARD_ASPECT_RATIO,
  NAME_AREA,
  PENDULUM_SET_CODE_AREA,
  SET_CODE_AREA,
  SET_CODE_READ_SCALE,
} from '@/src/features/scan/cardAreas';
import {
  areaInPhoto,
  cardCrops,
  coverScaling,
  cropsUnderFrame,
  previewRectToPhoto,
  sameOrientation,
} from '@/src/features/scan/frameMapping';

/**
 * Numbers chosen so the cover scaling is exact: a 3000 × 4000 photo under a 300 × 800 preview is
 * scaled by 0.2 (it fills the height) and is 600 points wide, so 150 points are cut on each side.
 * A preview point (x, y) is the photo pixel (5x + 750, 5y).
 */
const PORTRAIT_PREVIEW = { width: 300, height: 800 };
const PORTRAIT_PHOTO = { width: 3000, height: 4000 };
/** A card-shaped frame (59 × 86 times 4), centred. */
const FRAME = { x: 32, y: 228, width: 236, height: 344 };

describe('the areas config', () => {
  it('holds the owner coordinates as fractions of the card', () => {
    // The owner's 15–360 × 10–65, 290–405 × 435–465 on a 421 × 614 card, rounded to the percent.
    expect(NAME_AREA).toEqual({ left: 0.04, top: 0.02, right: 0.86, bottom: 0.11 });
    expect(SET_CODE_AREA).toEqual({ left: 0.69, top: 0.71, right: 0.96, bottom: 0.76 });
    expect(PENDULUM_SET_CODE_AREA).toEqual({ left: 0.04, top: 0.7, right: 0.45, bottom: 0.8 });
    expect(Math.round(15 / 4.21)).toBe(4);
    expect(Math.round(465 / 6.14)).toBe(76);
    expect(AREA_MARGIN).toBe(0.1);
    expect(SET_CODE_READ_SCALE).toBe(2);
    expect(CARD_ASPECT_RATIO).toBeCloseTo(59 / 86);
    expect(FRAME.width / FRAME.height).toBeCloseTo(CARD_ASPECT_RATIO);
  });
});

describe('the cover scaling', () => {
  it('fills the preview and cuts what overflows, centred', () => {
    expect(coverScaling(PORTRAIT_PREVIEW, PORTRAIT_PHOTO)).toEqual({
      scale: 0.2,
      offsetX: -150,
      offsetY: 0,
    });
    // A photo as tall as the screen is wide: the top and bottom are cut instead.
    expect(coverScaling({ width: 800, height: 300 }, { width: 4000, height: 3000 })).toEqual({
      scale: 0.2,
      offsetX: 0,
      offsetY: -150,
    });
  });
});

describe('the frame on the photo', () => {
  it('maps a card that touches each edge of the frame to the photo pixels under it', () => {
    const card = previewRectToPhoto(FRAME, PORTRAIT_PREVIEW, PORTRAIT_PHOTO);
    // Left edge 5 × 32 + 750, top edge 5 × 228, right edge 5 × 268 + 750, bottom edge 5 × 572.
    expect(card).toEqual({ x: 910, y: 1140, width: 1180, height: 1720 });
  });

  it('maps rectangles touching each edge of the preview to the visible part of the photo', () => {
    const left = previewRectToPhoto(
      { x: 0, y: 100, width: 100, height: 100 },
      PORTRAIT_PREVIEW,
      PORTRAIT_PHOTO
    );
    const right = previewRectToPhoto(
      { x: 200, y: 100, width: 100, height: 100 },
      PORTRAIT_PREVIEW,
      PORTRAIT_PHOTO
    );
    const top = previewRectToPhoto(
      { x: 100, y: 0, width: 100, height: 100 },
      PORTRAIT_PREVIEW,
      PORTRAIT_PHOTO
    );
    const bottom = previewRectToPhoto(
      { x: 100, y: 700, width: 100, height: 100 },
      PORTRAIT_PREVIEW,
      PORTRAIT_PHOTO
    );
    // The preview's left edge is photo column 750 (the cut part is not shown), not column 0.
    expect(left).toEqual({ x: 750, y: 500, width: 500, height: 500 });
    expect(right).toEqual({ x: 1750, y: 500, width: 500, height: 500 });
    expect((right?.x ?? 0) + (right?.width ?? 0)).toBe(2250);
    // Nothing is cut vertically: the edges are the photo's.
    expect(top).toEqual({ x: 1250, y: 0, width: 500, height: 500 });
    expect(bottom).toEqual({ x: 1250, y: 3500, width: 500, height: 500 });
  });

  it('places a photo that has the preview shape without cutting anything', () => {
    const card = previewRectToPhoto(
      { x: 32, y: 28, width: 236, height: 344 },
      { width: 300, height: 400 },
      PORTRAIT_PHOTO
    );
    expect(card).toEqual({ x: 320, y: 280, width: 2360, height: 3440 });
  });

  it('places a landscape photo under a landscape preview (top and bottom cut)', () => {
    const card = previewRectToPhoto(
      { x: 311.5, y: 21, width: 177, height: 258 },
      { width: 800, height: 300 },
      { width: 4000, height: 3000 }
    );
    expect(card).toEqual({ x: 1557.5, y: 855, width: 885, height: 1290 });
  });

  it('refuses a photo turned against the preview, and unusable sizes', () => {
    expect(sameOrientation(PORTRAIT_PREVIEW, { width: 4000, height: 3000 })).toBe(false);
    expect(sameOrientation(PORTRAIT_PREVIEW, { width: 3000, height: 3000 })).toBe(true);
    expect(previewRectToPhoto(FRAME, PORTRAIT_PREVIEW, { width: 4000, height: 3000 })).toBeNull();
    expect(cropsUnderFrame(FRAME, PORTRAIT_PREVIEW, { width: 4000, height: 3000 })).toBeNull();
    expect(previewRectToPhoto(FRAME, { width: 0, height: 800 }, PORTRAIT_PHOTO)).toBeNull();
    expect(previewRectToPhoto(FRAME, PORTRAIT_PREVIEW, { width: NaN, height: 4000 })).toBeNull();
    expect(previewRectToPhoto({ ...FRAME, width: 0 }, PORTRAIT_PREVIEW, PORTRAIT_PHOTO)).toBeNull();
  });

  it('keeps a rectangle inside the photo, and finds nothing off it', () => {
    // 50 points left of the preview is still photo (the cut part): columns 500 to 1000.
    expect(
      previewRectToPhoto(
        { x: -50, y: 0, width: 100, height: 100 },
        PORTRAIT_PREVIEW,
        PORTRAIT_PHOTO
      )
    ).toEqual({ x: 500, y: 0, width: 500, height: 500 });
    expect(
      previewRectToPhoto(
        { x: -400, y: 0, width: 100, height: 100 },
        PORTRAIT_PREVIEW,
        PORTRAIT_PHOTO
      )
    ).toBeNull();
    expect(
      previewRectToPhoto(
        { x: 100, y: 750, width: 100, height: 100 },
        PORTRAIT_PREVIEW,
        PORTRAIT_PHOTO
      )
    ).toEqual({ x: 1250, y: 3750, width: 500, height: 250 });
    // A card keeps its shape when asked: its areas stay where they are on the card.
    expect(
      previewRectToPhoto(
        { x: 100, y: 750, width: 100, height: 100 },
        PORTRAIT_PREVIEW,
        PORTRAIT_PHOTO,
        { clip: false }
      )
    ).toEqual({ x: 1250, y: 3750, width: 500, height: 500 });
  });
});

describe('the crops of a card', () => {
  const card = { x: 910, y: 1140, width: 1180, height: 1720 };

  it('crops the name and the set code with a 10 % margin, rounded outwards', () => {
    const crops = cardCrops(card, PORTRAIT_PHOTO);
    // Name: x 957.2–1924.8 widened by 96.76, y 1174.4–1329.2 widened by 15.48.
    expect(crops.name).toEqual({ x: 860, y: 1158, width: 1162, height: 187 });
    // Set code: x 1724.2–2042.8 widened by 31.86, y 2361.2–2447.2 widened by 8.6.
    expect(crops.setCode).toEqual({ x: 1692, y: 2352, width: 383, height: 104 });
  });

  it('crops the Pendulum spot at the left, under the pendulum text', () => {
    const crops = cardCrops(card, PORTRAIT_PHOTO);
    // x 4–45 % (957.2–1441) widened by 48.38, y 70–80 % (2344–2516) widened by 17.2.
    expect(crops.pendulumSetCode).toEqual({ x: 908, y: 2326, width: 582, height: 208 });
    expect(crops.pendulumSetCode.x + crops.pendulumSetCode.width).toBeLessThan(crops.setCode.x);
  });

  it('crops a landscape photo the same way', () => {
    const crops = cardCrops(
      { x: 1557.5, y: 855, width: 885, height: 1290 },
      { width: 4000, height: 3000 }
    );
    expect(crops).toEqual({
      name: { x: 1520, y: 869, width: 872, height: 140 },
      setCode: { x: 2144, y: 1764, width: 287, height: 78 },
      pendulumSetCode: { x: 1556, y: 1745, width: 437, height: 155 },
    });
  });

  it('never crops outside the photo', () => {
    const partlyOut = cardCrops({ x: -100, y: 1000, width: 1180, height: 1720 }, PORTRAIT_PHOTO);
    expect(partlyOut.name).toEqual({ x: 0, y: 1018, width: 1012, height: 187 });
    expect(partlyOut.pendulumSetCode).toEqual({ x: 0, y: 2186, width: 480, height: 208 });
    const offTheRight = areaInPhoto(
      { x: 2500, y: 2600, width: 1180, height: 1720 },
      SET_CODE_AREA,
      PORTRAIT_PHOTO
    );
    expect(offTheRight).toEqual({ x: 3000, y: 3812, width: 0, height: 104 });
  });

  it('takes a margin of its own', () => {
    expect(areaInPhoto(card, SET_CODE_AREA, PORTRAIT_PHOTO, 0)).toEqual({
      x: 1724,
      y: 2361,
      width: 319,
      height: 87,
    });
  });

  it('crops a camera photo from the frame on screen', () => {
    expect(cropsUnderFrame(FRAME, PORTRAIT_PREVIEW, PORTRAIT_PHOTO)).toEqual(
      cardCrops(card, PORTRAIT_PHOTO)
    );
    // A frame whose card would leave the photo has an empty crop: the photo is read whole.
    expect(
      cropsUnderFrame({ x: 32, y: 700, width: 236, height: 344 }, PORTRAIT_PREVIEW, PORTRAIT_PHOTO)
    ).toBeNull();
  });
});
