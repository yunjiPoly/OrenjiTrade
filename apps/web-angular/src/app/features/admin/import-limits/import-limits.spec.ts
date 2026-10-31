import {
  IMPORT_LIMIT_FIELDS,
  allowedLine,
  changesOf,
  limitError,
  sizeWords,
  valuesOf,
} from './import-limits';

const saved = {
  ydkMaxKb: 100,
  ydkMaxLines: 500,
  csvMaxKb: 2048,
  csvMaxRows: 5000,
  previewTtlMinutes: 60,
};

describe('import limits (board A15)', () => {
  it('says the API range of each field', () => {
    expect(allowedLine(IMPORT_LIMIT_FIELDS.ydkMaxKb)).toBe('Allowed: 1 to 1,024 kB.');
    expect(allowedLine(IMPORT_LIMIT_FIELDS.csvMaxRows)).toBe('Allowed: 10 to 20,000 rows.');
    expect(allowedLine(IMPORT_LIMIT_FIELDS.previewTtlMinutes)).toBe('Allowed: 5 to 1,440 minutes.');
  });

  it('keeps every field to the API’s bounds (InventoryImportSettings, review fix 1)', () => {
    const bounds = Object.fromEntries(
      Object.values(IMPORT_LIMIT_FIELDS).map((field) => [field.key, [field.min, field.max]]),
    );
    expect(bounds).toEqual({
      ydkMaxKb: [1, 1024],
      ydkMaxLines: [10, 5000],
      csvMaxKb: [16, 8192],
      csvMaxRows: [10, 20000],
      previewTtlMinutes: [5, 1440],
    });
    expect(limitError(IMPORT_LIMIT_FIELDS.ydkMaxLines, '5001')).toBe('Use 10 to 5,000 lines.');
    expect(limitError(IMPORT_LIMIT_FIELDS.ydkMaxLines, '5000')).toBeNull();
  });

  it('refuses an empty, decimal or out-of-range value', () => {
    const kb = IMPORT_LIMIT_FIELDS.csvMaxKb;
    expect(limitError(kb, '')).toBe('Enter the largest file.');
    expect(limitError(kb, '2.5')).toBe('Use a whole number.');
    expect(limitError(kb, '15')).toBe('Use 16 to 8,192 kB.');
    expect(limitError(kb, '8193')).toBe('Use 16 to 8,192 kB.');
    expect(limitError(kb, '16')).toBeNull();
    expect(limitError(kb, '8192')).toBeNull();
  });

  it('sends only what changed', () => {
    const values = valuesOf(saved);
    expect(changesOf(saved, values)).toEqual({});
    expect(changesOf(saved, { ...values, ydkMaxLines: '600', previewTtlMinutes: ' 60 ' })).toEqual({
      ydkMaxLines: 600,
    });
  });

  it('reads sizes as the phone does', () => {
    expect(sizeWords(100)).toBe('100 kB');
    expect(sizeWords(2048)).toBe('2 MB');
    expect(sizeWords(1500)).toBe('1,500 kB');
  });
});
