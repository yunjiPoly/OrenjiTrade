import * as ImagePicker from 'expo-image-picker';

import { afterModals } from '@/src/components/ui/modalTurns';
import { LIBRARY_PHOTO_OPTIONS } from '@/src/lib/photoPicker';

import { CARD_FORM_COPY } from './inventoryCopy';
import { nextPhotoKey, type LocalPhoto } from './inventoryUiStore';
import { itemPhotoProblem, photoMimeType } from './itemPhotoRules';

/** What a pick gave: the photos to keep and, when some were refused, why. */
export interface PickResult {
  photos: LocalPhoto[];
  problem: string | null;
}

const NOTHING: PickResult = { photos: [], problem: null };

function toLocal(asset: ImagePicker.ImagePickerAsset): LocalPhoto {
  return {
    key: nextPhotoKey(),
    uri: asset.uri,
    mimeType: photoMimeType(asset.mimeType, asset.fileName),
    fileName: asset.fileName ?? 'card.jpg',
    size: typeof asset.fileSize === 'number' ? asset.fileSize : null,
    file: asset.file ?? null,
  };
}

/** Keeps the photos the API takes (JPEG / PNG / WebP up to 8 MB), and says why one was not. */
function accepted(assets: readonly ImagePicker.ImagePickerAsset[], room: number): PickResult {
  const photos: LocalPhoto[] = [];
  let problem: string | null = null;
  for (const asset of assets) {
    const photo = toLocal(asset);
    const refusal = itemPhotoProblem(photo);
    if (refusal) {
      problem = problem ?? refusal;
    } else if (photos.length < room) {
      photos.push(photo);
    }
  }
  return { photos, problem };
}

/**
 * Photos from the device's library (owner spec 2026-10-14, section 6: up to 4, "Show the real
 * card, front and back"): several at once, up to `room`. The API strips the location and every
 * other metadata when it re-encodes them.
 */
export async function pickFromLibrary(room: number): Promise<PickResult> {
  if (room <= 0) {
    return NOTHING;
  }
  // iOS presents the picker only once the sheet that asked for it has left the screen.
  await afterModals();
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { photos: [], problem: CARD_FORM_COPY.allowPhotos };
  }
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      ...LIBRARY_PHOTO_OPTIONS,
      quality: 0.9,
      allowsMultipleSelection: room > 1,
      selectionLimit: room,
    });
  } catch {
    // The web picker refuses a file that is not an image before the app sees it.
    return { photos: [], problem: 'Use a JPEG, PNG or WebP photo.' };
  }
  return result.canceled ? NOTHING : accepted(result.assets, room);
}

/**
 * A photo taken with the camera (a picture of the card, never a scan: card recognition stays on
 * hold). A device without a camera (a simulator) says so.
 */
export async function takeWithCamera(room: number): Promise<PickResult> {
  if (room <= 0) {
    return NOTHING;
  }
  await afterModals();
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { photos: [], problem: CARD_FORM_COPY.allowCamera };
  }
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
  } catch {
    return { photos: [], problem: CARD_FORM_COPY.cameraUnavailable };
  }
  return result.canceled ? NOTHING : accepted(result.assets, room);
}
