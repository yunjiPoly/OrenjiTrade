/** A picked image, as `expo-image-picker` returns it. */
export interface PickedImage {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  /** Web only: the browser `File`. */
  file?: Blob | null;
}

/**
 * The multipart body of an image upload (`file` part): the browser `File` on web, a `blob:` /
 * `data:` URI read into a Blob, or a local file URI that React Native's FormData streams itself.
 */
export async function imageFormData(image: PickedImage, baseName: string): Promise<FormData> {
  const form = new FormData();
  const type = image.mimeType ?? 'image/jpeg';
  const name = image.fileName ?? `${baseName}.${type.split('/')[1] ?? 'jpg'}`;
  if (image.file) {
    form.append('file', image.file, name);
  } else if (/^(blob|data):/.test(image.uri)) {
    form.append('file', await (await fetch(image.uri)).blob(), name);
  } else {
    // React Native's FormData streams a local file from its URI.
    form.append('file', { uri: image.uri, name, type } as unknown as Blob);
  }
  return form;
}
