import * as DocumentPicker from 'expo-document-picker';

import { importFormData, pastedFileName } from '@/src/features/inventory/import/importFile';
import { IMPORT_PICKER_TYPE, pickImportFile } from '@/src/features/inventory/import/pickImportFile';

const mockFiles: { uri: string; name: string; content: string | null; deleted: boolean }[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class MockFile {
    uri: string;
    mockEntry: { uri: string; name: string; content: string | null; deleted: boolean };
    constructor(...parts: string[]) {
      this.uri = parts.join('');
      this.mockEntry = {
        uri: this.uri,
        name: parts[parts.length - 1] ?? '',
        content: null,
        deleted: false,
      };
      mockFiles.push(this.mockEntry);
    }
    create() {}
    write(content: string) {
      this.mockEntry.content = content;
    }
    delete() {
      this.mockEntry.deleted = true;
    }
    bytes() {
      return new Uint8Array();
    }
  },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const picker = DocumentPicker as jest.Mocked<typeof DocumentPicker>;

/** What a body carries, as `[name, value]` (the FormData of the test runtime would turn a device file into text). */
async function appended(run: () => Promise<{ dispose: () => void }>) {
  const append = jest.spyOn(FormData.prototype, 'append').mockImplementation(() => undefined);
  try {
    const { dispose } = await run();
    return { parts: append.mock.calls.map((call) => [...call] as unknown[]), dispose };
  } finally {
    append.mockRestore();
  }
}

beforeEach(() => {
  mockFiles.length = 0;
});

describe('the body of an import upload on a device (jest-expo runs the app as iOS)', () => {
  it('carries a picked file as the device file it is, under `file`', async () => {
    const { parts } = await appended(() =>
      importFormData('YDK', {
        kind: 'file',
        file: { uri: 'file:///cache/DocumentPicker/deck.ydk', name: 'deck.ydk', size: 64 },
      })
    );
    expect(parts).toHaveLength(1);
    expect(parts[0]?.[0]).toBe('file');
    // An expo-file-system File: what Expo's fetch reads (it has the bytes of the file).
    expect((parts[0]?.[1] as { uri: string }).uri).toBe('file:///cache/DocumentPicker/deck.ydk');
    expect(typeof (parts[0]?.[1] as { bytes: unknown }).bytes).toBe('function');
  });

  it('sends a pasted text as the same part: written to a cache file, removed afterwards', async () => {
    const text = '#main\n910000001\n';
    const { parts, dispose } = await appended(() => importFormData('YDK', { kind: 'text', text }));
    const written = mockFiles.find((file) => file.content !== null);
    expect(written?.content).toBe(text);
    expect(written?.name).toMatch(/^orenjitrade-import-\d+\.ydk$/);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.[0]).toBe('file');
    expect((parts[0]?.[1] as { uri: string }).uri).toBe(written?.uri);
    // The cache file goes once the upload answered.
    expect(written?.deleted).toBe(false);
    dispose();
    expect(written?.deleted).toBe(true);
  });

  it('names a pasted file after its source (the API reads the content, not the name)', () => {
    expect(pastedFileName('YDK', 42)).toBe('orenjitrade-import-42.ydk');
    expect(pastedFileName('COLLECTR_CSV', 42)).toBe('orenjitrade-import-42.csv');
  });
});

describe('the system file picker of the import', () => {
  it('offers every file (a deck file has no type of its own) and copies the pick for the upload', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/DocumentPicker/deck.ydk',
          name: 'deck.ydk',
          size: 64,
          mimeType: 'application/octet-stream',
          lastModified: 0,
        },
      ],
    });
    await expect(pickImportFile()).resolves.toEqual({
      uri: 'file:///cache/DocumentPicker/deck.ydk',
      name: 'deck.ydk',
      size: 64,
      file: null,
    });
    expect(IMPORT_PICKER_TYPE).toBe('*/*');
    expect(picker.getDocumentAsync).toHaveBeenCalledWith({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });
  });

  it('answers nothing when the collector closed the picker', async () => {
    picker.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickImportFile()).resolves.toBeNull();
  });
});
