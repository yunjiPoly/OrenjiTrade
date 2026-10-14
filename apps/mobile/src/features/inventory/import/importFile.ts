import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { localFilePart } from '@/src/api/localFilePart';
import type { ImportSource } from '@/src/api/types';

import { IMPORT_SOURCES } from './importLabels';

/** A file picked with the system file picker (`pickImportFile`). */
export interface PickedImportFile {
  uri: string;
  name: string;
  /** Bytes, when the picker says. */
  size?: number | null;
  /** Web only: the browser's `File`. */
  file?: Blob | null;
}

/** What is uploaded: a picked file, or the text of a file the collector pasted. */
export type ImportUpload =
  { kind: 'file'; file: PickedImportFile } | { kind: 'text'; text: string };

export interface ImportBody {
  /** The multipart body: one part `file`. */
  body: FormData;
  /** Removes what the body needed on the device (call once the upload answered). */
  dispose: () => void;
}

/**
 * Whether a file is the copy the system picker made for the app: `expo-document-picker` copies a
 * pick into the folder `DocumentPicker` of the app's cache directory and never removes it. Only
 * such a copy is ever deleted here, never a file at any other place.
 */
export function isPickerCopy(uri: string): boolean {
  return /^file:\/\/.*\/DocumentPicker\/[^/]+$/.test(uri);
}

/**
 * Removes what an upload left on the device once it is no longer needed: the copy the picker
 * made of the chosen file. A Collectr export holds what its owner paid for every card; the copy
 * does not stay behind in the app's cache after the import, after a refusal, or after the
 * collector changed their mind. A pasted text leaves nothing: its file only exists while it is
 * sent (`importFormData`).
 */
export function discardUpload(upload: ImportUpload | null | undefined): void {
  if (upload?.kind !== 'file' || !isPickerCopy(upload.file.uri)) {
    return;
  }
  try {
    new File(upload.file.uri).delete();
  } catch {
    // Already gone, or the system emptied its cache.
  }
}

/** Name of the file a pasted text is sent as (the API ignores names: the content decides). */
export function pastedFileName(source: ImportSource, now: number = Date.now()): string {
  return `orenjitrade-import-${now}${IMPORT_SOURCES[source].extension}`;
}

/**
 * The multipart body of an import upload on a device.
 *
 * A picked file is sent as the local file it is (`localFilePart`: on iOS a device file, which is
 * what Expo's fetch reads). A pasted text takes the same road: it is written to a file of the
 * app's cache directory and sent as that file, so "paste" and "choose a file" are one upload. (A
 * text part would arrive as a form field, not as a file, and the API reads the part `file`.)
 * Either way `dispose` deletes the file once the upload answered: the cache file of a pasted
 * text, and the copy the picker made of a chosen file.
 */
export async function importFormData(
  source: ImportSource,
  upload: ImportUpload
): Promise<ImportBody> {
  const body = new FormData();
  if (upload.kind === 'file') {
    body.append(
      'file',
      localFilePart(Platform.OS, {
        uri: upload.file.uri,
        name: upload.file.name,
        type: 'text/plain',
      })
    );
    return { body, dispose: () => discardUpload(upload) };
  }
  const name = pastedFileName(source);
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(upload.text);
  body.append('file', localFilePart(Platform.OS, { uri: file.uri, name, type: 'text/plain' }));
  return {
    body,
    dispose: () => {
      try {
        file.delete();
      } catch {
        // The cache directory is the system's to empty anyway.
      }
    },
  };
}
