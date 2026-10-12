import { File } from 'expo-file-system';

/** A local file to upload: a picked photo's `file://` URI with its name and type. */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}

/**
 * The multipart part of a local file.
 *
 * On a device the app's `fetch` is Expo's, and Expo's fetch does not take React Native's
 * `{ uri, name, type }` file part: it throws "Unsupported FormDataPart implementation" before
 * anything is sent. On iOS every photo upload (a photo in a conversation, a card photo, a profile
 * picture, dispute evidence) ended in "We could not reach OrenjiTrade." An `expo-file-system`
 * File is what Expo's fetch reads, so iOS sends that.
 *
 * Android keeps React Native's part for now. It runs the same fetch and is expected to fail the
 * same way, but this was found and proven on the iOS simulator (2026-10-10) with no Android
 * emulator at hand: drop the platform check once an Android run has proven the File part there.
 */
export function localFilePart(platform: string, file: LocalFile): Blob {
  if (platform === 'ios') {
    return new File(file.uri) as unknown as Blob;
  }
  return file as unknown as Blob;
}
