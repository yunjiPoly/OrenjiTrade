import * as ImagePicker from 'expo-image-picker';

import { afterModals } from '@/src/components/ui/modalTurns';
import { LIBRARY_PHOTO_OPTIONS } from '@/src/lib/photoPicker';

import type { PhotoToRead } from './scanRunner';

/** Up to 50 library photos at a time, one card per photo (the owner's default 2, spec section 10). */
export const LIBRARY_PHOTO_LIMIT = 50;

/**
 * Photos the collector already took, for the scan ("Photos" on the camera, "Choose from photos" on
 * Add cards): several at once, in the order they were picked, each read whole on the phone. The
 * picker hands over its own copy of each photo, in the app's cache: the scan deletes it when it
 * ends. No EXIF is read (spec section 5). Null when the collector cancelled; a picker that fails
 * throws.
 */
export async function pickScanPhotos(
  limit: number = LIBRARY_PHOTO_LIMIT
): Promise<PhotoToRead[] | null> {
  // iOS presents the picker only once a sheet that asked for it has left the screen.
  await afterModals();
  const result = await ImagePicker.launchImageLibraryAsync({
    ...LIBRARY_PHOTO_OPTIONS,
    allowsMultipleSelection: true,
    orderedSelection: true,
    selectionLimit: limit,
    exif: false,
  });
  if (result.canceled) {
    return null;
  }
  return result.assets.slice(0, limit).map((asset) => ({
    photo: { uri: asset.uri, width: asset.width, height: asset.height, owned: true },
    source: 'LIBRARY' as const,
  }));
}
