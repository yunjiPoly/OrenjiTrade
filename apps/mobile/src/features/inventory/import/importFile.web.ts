import type { ImportSource } from '@/src/api/types';

import { IMPORT_SOURCES } from './importLabels';

/** A file picked with the system file picker (`pickImportFile`). */
export interface PickedImportFile {
  uri: string;
  name: string;
  /** Bytes, when the picker says. */
  size?: number | null;
  /** The browser's `File`. */
  file?: Blob | null;
}

/** What is uploaded: a picked file, or the text of a file the collector pasted. */
export type ImportUpload =
  { kind: 'file'; file: PickedImportFile } | { kind: 'text'; text: string };

export interface ImportBody {
  /** The multipart body: one part `file`. */
  body: FormData;
  /** Nothing to remove in a browser. */
  dispose: () => void;
}

/** A browser keeps no copy of a picked file: nothing to remove. */
export function isPickerCopy(_uri: string): boolean {
  return false;
}

/** A browser keeps no copy of a picked file: nothing to remove. */
export function discardUpload(_upload: ImportUpload | null | undefined): void {}

/** Name of the file a pasted text is sent as (the API ignores names: the content decides). */
export function pastedFileName(source: ImportSource, now: number = Date.now()): string {
  return `orenjitrade-import-${now}${IMPORT_SOURCES[source].extension}`;
}

/**
 * Web build: the multipart body of an import upload. The browser's own `File` of the picker, or a
 * pasted text as a Blob: both are a part `file` with a file name, the same upload.
 */
export async function importFormData(
  source: ImportSource,
  upload: ImportUpload
): Promise<ImportBody> {
  const body = new FormData();
  if (upload.kind === 'text') {
    body.append('file', new Blob([upload.text], { type: 'text/plain' }), pastedFileName(source));
  } else if (upload.file.file) {
    body.append('file', upload.file.file, upload.file.name);
  } else {
    body.append('file', await (await fetch(upload.file.uri)).blob(), upload.file.name);
  }
  return { body, dispose: () => undefined };
}
