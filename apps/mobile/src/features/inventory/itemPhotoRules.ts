import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';

/**
 * Owner photos of an inventory item (mirror of the web's `item-photos.component.ts`): up to four
 * JPEG / PNG / WebP photos of 8 MB at most, re-encoded by the API without any metadata.
 */
export const ITEM_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const ITEM_PHOTO_MAX_COUNT = 4;
export const ITEM_PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
export const ITEM_PHOTO_HINT = `Up to ${ITEM_PHOTO_MAX_COUNT} photos (JPEG, PNG or WebP, 8 MB). Location data is removed from photos.`;
export const ITEM_PHOTO_TYPE_MESSAGE = 'Use a JPEG, PNG or WebP photo.';

/** The photo type from what the picker reports (the API sniffs the real one). */
export function photoMimeType(
  mimeType: string | null | undefined,
  fileName: string | null | undefined
): string {
  if (mimeType) {
    return mimeType.toLowerCase();
  }
  const extension = fileName?.split('.').pop()?.toLowerCase();
  return extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
}

/** Client-side check before uploading (the API re-checks and re-encodes). */
export function itemPhotoProblem(photo: {
  mimeType?: string | null;
  size?: number | null;
}): string | null {
  const type = (photo.mimeType ?? 'image/jpeg').toLowerCase();
  if (!ITEM_PHOTO_TYPES.includes(type)) {
    return ITEM_PHOTO_TYPE_MESSAGE;
  }
  if (photo.size === 0) {
    return 'That file is empty.';
  }
  if (typeof photo.size === 'number' && photo.size > ITEM_PHOTO_MAX_BYTES) {
    return 'Choose a photo smaller than 8 MB.';
  }
  return null;
}

/** The longest side of a photo the API takes, in pixels (`ItemImageProcessor.MAX_EDGE_IN`). */
export const ITEM_PHOTO_MAX_EDGE = 8192;

/**
 * What the API's refusal of a photo means (409 full, 413 too big, 415 wrong type, 400 too large in
 * pixels or unreadable).
 */
export function itemPhotoErrorMessage(error: ApiError): string {
  switch (error.status) {
    case 409:
      return `A card can have at most ${ITEM_PHOTO_MAX_COUNT} photos.`;
    case 413:
      return 'Choose a photo smaller than 8 MB.';
    case 415:
      return ITEM_PHOTO_TYPE_MESSAGE;
    case 400:
      return /pixel|dimension/i.test(error.fieldErrors.file ?? '')
        ? `This photo is too large: at most ${ITEM_PHOTO_MAX_EDGE} pixels on each side. Choose another one.`
        : 'That photo could not be read. Try another one.';
    default:
      return friendlyMessage(error);
  }
}

/**
 * Why trying the same photo again cannot work: the API refused the photo itself (400, 409, 413,
 * 415), and the collector can only remove it. `null` for a network or server error, which "Try
 * again" may get past.
 */
export function photoRefusal(error: ApiError | null | undefined): string | null {
  if (!error || ![400, 409, 413, 415].includes(error.status)) {
    return null;
  }
  return itemPhotoErrorMessage(error);
}
