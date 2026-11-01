import type { InventoryImportSettingsResponse } from '@orenji/api-client';

/** The five import limits (spec 15.7, board A15). */
export type ImportLimitKey =
  'ydkMaxKb' | 'ydkMaxLines' | 'csvMaxKb' | 'csvMaxRows' | 'previewTtlMinutes';

/** One limit's field: its bounds and words (the API's ranges, `PUT /admin/inventory/import-settings`). */
export interface ImportLimitField {
  key: ImportLimitKey;
  label: string;
  unit: string;
  min: number;
  max: number;
}

export const IMPORT_LIMIT_FIELDS: Readonly<Record<ImportLimitKey, ImportLimitField>> = {
  ydkMaxKb: { key: 'ydkMaxKb', label: 'Largest file', unit: 'kB', min: 1, max: 1024 },
  ydkMaxLines: { key: 'ydkMaxLines', label: 'Most lines', unit: 'lines', min: 10, max: 5000 },
  csvMaxKb: { key: 'csvMaxKb', label: 'Largest file', unit: 'kB', min: 16, max: 8192 },
  csvMaxRows: { key: 'csvMaxRows', label: 'Most rows', unit: 'rows', min: 10, max: 20000 },
  previewTtlMinutes: {
    key: 'previewTtlMinutes',
    label: 'Keep previews and results for',
    unit: 'minutes',
    min: 5,
    max: 1440,
  },
};

export type ImportLimitValues = Record<ImportLimitKey, string>;

/** "Allowed: 1 to 1,024 kB." */
export function allowedLine(field: ImportLimitField): string {
  return `Allowed: ${field.min.toLocaleString('en-US')} to ${field.max.toLocaleString('en-US')} ${
    field.unit
  }.`;
}

/** The error of one field, or `null` (a whole number within the API's range). */
export function limitError(field: ImportLimitField, raw: string): string | null {
  const text = raw.trim();
  if (!text) {
    return `Enter the ${field.label.toLowerCase()}.`;
  }
  if (!/^\d+$/.test(text)) {
    return 'Use a whole number.';
  }
  const value = Number(text);
  if (value < field.min || value > field.max) {
    return allowedLine(field).replace('Allowed:', 'Use');
  }
  return null;
}

/** The form's values from the API. */
export function valuesOf(settings: InventoryImportSettingsResponse): ImportLimitValues {
  return {
    ydkMaxKb: String(settings.ydkMaxKb),
    ydkMaxLines: String(settings.ydkMaxLines),
    csvMaxKb: String(settings.csvMaxKb),
    csvMaxRows: String(settings.csvMaxRows),
    previewTtlMinutes: String(settings.previewTtlMinutes),
  };
}

/** The fields that changed, as numbers (the API takes any subset). */
export function changesOf(
  saved: InventoryImportSettingsResponse,
  values: ImportLimitValues,
): Partial<Record<ImportLimitKey, number>> {
  const changes: Partial<Record<ImportLimitKey, number>> = {};
  for (const key of Object.keys(IMPORT_LIMIT_FIELDS) as ImportLimitKey[]) {
    const value = Number(values[key].trim());
    if (values[key].trim() !== '' && value !== saved[key]) {
      changes[key] = value;
    }
  }
  return changes;
}

/** "Up to 100 kB and 500 lines" (kB from 1,024 up read in MB, as the phone does). */
export function sizeWords(kb: number): string {
  if (kb >= 1024 && kb % 1024 === 0) {
    return `${kb / 1024} MB`;
  }
  return `${kb.toLocaleString('en-US')} kB`;
}
