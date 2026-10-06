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
    return 'Use a JPEG, PNG or WebP photo.';
  }
  if (photo.size === 0) {
    return 'That file is empty.';
  }
  if (typeof photo.size === 'number' && photo.size > ITEM_PHOTO_MAX_BYTES) {
    return 'Choose a photo smaller than 8 MB.';
  }
  return null;
}

/** What the API's refusal of a photo means (409 full, 413 too big, 415 wrong type, 400 unreadable). */
export function itemPhotoErrorMessage(error: ApiError): string {
  switch (error.status) {
    case 409:
      return `A card can have at most ${ITEM_PHOTO_MAX_COUNT} photos.`;
    case 413:
      return 'Choose a photo smaller than 8 MB.';
    case 415:
      return 'Use a JPEG, PNG or WebP photo.';
    case 400:
      return 'That photo could not be read. Try another one.';
    default:
      return friendlyMessage(error);
  }
}
