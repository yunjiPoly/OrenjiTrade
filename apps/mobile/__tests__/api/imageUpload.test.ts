import { File } from 'expo-file-system';

import { imageFormData } from '@/src/api/imageFormData';
import { localFilePart } from '@/src/api/localFilePart';
import { LIBRARY_PHOTO_OPTIONS } from '@/src/lib/photoPicker';

const PHOTO = { uri: 'file:///cache/ImagePicker/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };

/** What `imageFormData` appends, as `[name, value]` (the FormData of the test runtime would turn a device file into text). */
async function appended(
  image: Parameters<typeof imageFormData>[0],
  baseName: string
): Promise<unknown[][]> {
  const append = jest.spyOn(FormData.prototype, 'append').mockImplementation(() => undefined);
  try {
    await imageFormData(image, baseName);
    return append.mock.calls.map((call) => [...call]);
  } finally {
    append.mockRestore();
  }
}

describe('a photo picked from the library', () => {
  it('is asked for as an image in the format every server takes (iOS converts HEIC to JPEG)', () => {
    expect(LIBRARY_PHOTO_OPTIONS).toEqual({
      mediaTypes: ['images'],
      preferredAssetRepresentationMode: 'compatible',
    });
  });
});

describe('the multipart part of a local photo', () => {
  it('iOS: a file of the device, which Expo’s fetch can read', () => {
    const part = localFilePart('ios', PHOTO);
    expect(part).toBeInstanceOf(File);
    expect((part as unknown as File).uri).toBe(PHOTO.uri);
    // What Expo's fetch needs of a part: its bytes (React Native's `{ uri }` part has none).
    expect(typeof (part as unknown as File).bytes).toBe('function');
  });

  it('Android keeps React Native’s `{ uri, name, type }` part, unchanged', () => {
    expect(localFilePart('android', PHOTO)).toBe(PHOTO);
  });
});

describe('the body of an image upload', () => {
  // jest-expo runs the app as iOS.
  it('carries a local photo as a device file under `file`', async () => {
    const parts = await appended({ uri: PHOTO.uri, mimeType: 'image/jpeg' }, 'card');
    expect(parts).toHaveLength(1);
    expect(parts[0]?.[0]).toBe('file');
    expect(parts[0]?.[1]).toBeInstanceOf(File);
  });

  it('sends the browser’s own File when the picker gives one (web)', async () => {
    const file = new Blob(['x'], { type: 'image/png' });
    const parts = await appended({ uri: 'blob:local', file }, 'avatar');
    expect(parts).toEqual([['file', file, 'avatar.jpeg']]);
  });
});
