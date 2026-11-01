import * as DocumentPicker from 'expo-document-picker';

import { afterModals } from '@/src/components/ui/modalTurns';

import type { PickedImportFile } from './importFile';

/**
 * What the system file picker offers: every file. A `.ydk` deck file has no registered type, and
 * a CSV is reported under several ones depending on the app that saved it (text/csv,
 * text/comma-separated-values, application/vnd.ms-excel, plain text): a filter would grey out the
 * very file the collector is looking for. What a file is, the API decides from its content.
 */
export const IMPORT_PICKER_TYPE = '*/*';

/**
 * Opens the system file picker (Files on iOS, the document picker on Android, the browser's file
 * chooser on the web) for one file. Resolves with the file, or `null` when the collector closed
 * the picker. On a device the picked file is a copy in the app's cache directory, which the
 * upload can read.
 */
export async function pickImportFile(): Promise<PickedImportFile | null> {
  // iOS presents its picker over the screen: never while a sheet of the app is still closing.
  await afterModals();
  const result = await DocumentPicker.getDocumentAsync({
    type: IMPORT_PICKER_TYPE,
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) {
    return null;
  }
  return {
    uri: asset.uri,
    name: asset.name,
    size: asset.size ?? null,
    file: asset.file ?? null,
  };
}
