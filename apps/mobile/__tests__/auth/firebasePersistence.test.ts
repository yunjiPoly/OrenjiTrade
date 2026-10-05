import type { Persistence } from 'firebase/auth';

import { authPersistence } from '@/src/auth/firebase';

const persistence = (type: string) => ({ type }) as unknown as Persistence;

function fakeSdk(withReactNative: boolean) {
  const reactNative = persistence('ASYNC_STORAGE');
  return {
    indexedDBLocalPersistence: persistence('INDEXED_DB'),
    browserLocalPersistence: persistence('LOCAL'),
    inMemoryPersistence: persistence('NONE'),
    getReactNativePersistence: withReactNative ? jest.fn(() => reactNative) : undefined,
    reactNative,
  };
}

describe('Firebase Auth persistence', () => {
  it('uses IndexedDB then localStorage on web', () => {
    const sdk = fakeSdk(true);
    expect(authPersistence('web', sdk, null)).toEqual([
      sdk.indexedDBLocalPersistence,
      sdk.browserLocalPersistence,
    ]);
    expect(sdk.getReactNativePersistence).not.toHaveBeenCalled();
  });

  it('uses AsyncStorage on Android and iOS', () => {
    const storage = { getItem: jest.fn() };
    for (const platform of ['android', 'ios']) {
      const sdk = fakeSdk(true);
      expect(authPersistence(platform, sdk, storage)).toBe(sdk.reactNative);
      expect(sdk.getReactNativePersistence).toHaveBeenCalledWith(storage);
    }
  });

  it('never falls back to browser storage on native: memory only, with a warning', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sdk = fakeSdk(false);
    expect(authPersistence('android', sdk, { getItem: jest.fn() })).toBe(sdk.inMemoryPersistence);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('kept in memory only'));
    warn.mockRestore();
  });
});
