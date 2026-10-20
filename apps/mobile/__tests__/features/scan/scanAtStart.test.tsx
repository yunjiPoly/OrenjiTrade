import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor } from '@testing-library/react-native';

import RootLayout from '@/app/_layout';
import { SCAN_PHOTO_JOURNAL_KEY } from '@/src/features/scan/scanPhotoJournal';
import { scanRunner } from '@/src/features/scan/scanRunner';

import { mockFiles, resetScanMocks } from '../../support/scanScreen';

/**
 * A scan lives in memory (the owner's default 1): when the app is closed in the middle of one, its
 * photo copies stay in the app's cache. The app deletes them at its next start (the root layout),
 * not only once a scan screen opens. Fictional file names only.
 */

jest.mock('expo-font', () => ({ useFonts: jest.fn(() => [false, null]) }));
jest.mock('expo-file-system', () => require('../../support/scanScreen').fileSystemMock());

beforeEach(() => {
  resetScanMocks();
});

describe('the app at start-up', () => {
  it('deletes the photo copies of a scan lost when the app was closed, once', async () => {
    const lost = ['file:///cache/ImagePicker/lost-1.jpg', 'file:///cache/Camera/lost-2.jpg'];
    await AsyncStorage.setItem(SCAN_PHOTO_JOURNAL_KEY, JSON.stringify(lost));
    const sweep = jest.spyOn(scanRunner, 'sweepLeftovers');
    try {
      // The fonts still load: the layout draws nothing yet, its start-up work runs all the same.
      const view = render(<RootLayout />);
      expect(sweep).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(mockFiles.deleted).toEqual(lost));
      expect(await AsyncStorage.getItem(SCAN_PHOTO_JOURNAL_KEY)).toBeNull();
      view.rerender(<RootLayout />);
      expect(sweep).toHaveBeenCalledTimes(1);
      view.unmount();
    } finally {
      sweep.mockRestore();
    }
  });
});
