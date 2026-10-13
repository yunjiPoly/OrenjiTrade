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
 * text part would arrive as a form field, not as a file, and the API reads the part `file`.) The
 * cache file is deleted once the upload answered.
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
    return { body, dispose: () => undefined };
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
