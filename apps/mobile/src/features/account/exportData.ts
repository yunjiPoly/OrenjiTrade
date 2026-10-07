import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { fetchAccountExport } from '@/src/api/hooks/account';

import { exportFileName } from './exportFileName';

export { exportFileName };

/**
 * iOS/Android: downloads `GET /api/v1/me/export`, writes it to the app's cache directory and opens
 * the system share sheet so the collector can save it (Files, Drive, e-mail to themselves).
 * Resolves with the file name. Rejects with an `ApiError` (e.g. 429 when rate limited) or an
 * `Error` when the device cannot share files.
 */
export async function exportMyData(handle: string | null | undefined): Promise<string> {
  const data = await fetchAccountExport();
  const name = exportFileName(handle);
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  // Asynchronous since expo-file-system 58 (SDK 58): the file is complete before it is shared.
  await file.write(JSON.stringify(data, null, 2));
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing files is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Save your OrenjiTrade data',
  });
  return name;
}
