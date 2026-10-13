import type {
  ImagePickerOptions,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker';

/**
 * How the app asks the device's photo library for a picture.
 *
 * iPhones take HEIC photos, and iOS hands a library photo over in the format it is stored in. The
 * API takes JPEG, PNG and WebP (`IMAGE_TYPES`), so nearly every photo of an iPhone's camera roll
 * was refused with "Use a JPEG, PNG or WebP photo." On iOS the picker is asked for its
 * "compatible" representation instead: iOS converts a HEIC photo to JPEG before the app gets it.
 * Android and the web ignore the option (theirs are JPEG, PNG or WebP already).
 *
 * (The value is written as a string: the enum of `expo-image-picker` is only its type here.)
 */
export const LIBRARY_PHOTO_OPTIONS: Pick<
  ImagePickerOptions,
  'mediaTypes' | 'preferredAssetRepresentationMode'
> = {
  mediaTypes: ['images'],
  preferredAssetRepresentationMode: 'compatible' as UIImagePickerPreferredAssetRepresentationMode,
};
