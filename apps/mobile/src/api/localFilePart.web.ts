/** A local file to upload (native only: the web build uploads the browser's `File` or a Blob). */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}

/** Web: never reached with a local file path; kept so the web bundle does not load the device file system. */
export function localFilePart(_platform: string, file: LocalFile): Blob {
  return file as unknown as Blob;
}
