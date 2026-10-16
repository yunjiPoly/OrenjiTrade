import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The photo files of the scan, written down while the scan runs (their local addresses only,
 * never the photos). A scan lives in memory (the owner's default 1): closing the app loses it, and
 * its photo files would stay in the app's cache. The next scan of a later run deletes the files an
 * earlier run wrote down (`ScanRunner.sweepLeftovers`), so every photo the scan made or copied is
 * deleted, even when the scan never ended in the app.
 */
export interface ScanPhotoJournal {
  /** The files written down. */
  read: () => Promise<string[]>;
  /** Writes down exactly these files (none: forgets them all). */
  write: (uris: readonly string[]) => Promise<void>;
}

export const SCAN_PHOTO_JOURNAL_KEY = 'orenji.scan.photoFiles';

function parse(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((uri): uri is string => typeof uri === 'string')
      : [];
  } catch {
    return [];
  }
}

/** The journal in the app's storage (on this phone only). Never throws. */
export const storedScanPhotoJournal: ScanPhotoJournal = {
  read: async () => {
    try {
      return parse(await AsyncStorage.getItem(SCAN_PHOTO_JOURNAL_KEY));
    } catch {
      return [];
    }
  },
  write: async (uris) => {
    try {
      if (uris.length === 0) {
        await AsyncStorage.removeItem(SCAN_PHOTO_JOURNAL_KEY);
      } else {
        await AsyncStorage.setItem(SCAN_PHOTO_JOURNAL_KEY, JSON.stringify(uris));
      }
    } catch {
      // The system clears the cache in the end.
    }
  },
};

/** A journal in memory (tests). */
export function memoryScanPhotoJournal(initial: readonly string[] = []): ScanPhotoJournal & {
  uris: string[];
} {
  const journal = {
    uris: [...initial],
    read: async () => [...journal.uris],
    write: async (uris: readonly string[]) => {
      journal.uris = [...uris];
    },
  };
  return journal;
}
