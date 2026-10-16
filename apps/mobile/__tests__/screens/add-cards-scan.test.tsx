import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { AccessibilityInfo } from 'react-native';

import AddCardsScreen from '@/app/items/new';
import ScanReviewRoute from '@/app/scan/review';
import { scanRunner } from '@/src/features/scan/scanRunner';
import { resetScanReviewOptions } from '@/src/features/scan/scanReviewOptions';
import { useScanStore } from '@/src/features/scan/scanStore';
import type { ScanRead } from '@/src/features/scan/types';
import { LIBRARY_PHOTO_OPTIONS } from '@/src/lib/photoPicker';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { mockApi, ok, type MockAnswer, type MockRequest } from '../support/mockApi';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { LANTERN, YEW } from '../support/scanFixtures';
import {
  answerFor,
  libraryPhoto,
  mockFiles,
  mockReader,
  PHOTO_TEXT,
  readerOf,
  resetScanMocks,
  scanRoutes,
} from '../support/scanScreen';
import { READ_BLUR, seedScan } from '../support/scanSeed';
import { renderWithProviders, resetAppState } from '../test-utils';

/**
 * Add cards with the card scan (mockup screen 26, owner spec 2026-10-15, section 4): its two rows
 * show only where the scan works (the flag `cardTextScan` on and a build with the reader), before
 * the imports; "Choose from photos" goes through the photo picker to the review, which reads the
 * photos ("Reading 1 of 2…") and fills in as each is matched. Fictional photos and cards.
 */

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: () => undefined }));
jest.mock('expo-camera', () => require('../support/scanScreen').expoCameraMock());
jest.mock('@/src/features/scan/ocr/deviceOcr', () =>
  require('../support/scanScreen').deviceOcrMock()
);
jest.mock('expo-file-system', () => require('../support/scanScreen').fileSystemMock());
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const pickLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;

function renderAddCards(flags: Record<string, boolean> = { cardTextScan: true }) {
  const api = mockApi(scanRoutes({ 'GET /api/v1/public/feature-flags': ok(flags) }));
  const view = renderWithProviders(<AddCardsScreen />, {
    port: new FakeAuthPort(testUser()),
    scheme: 'dark',
  });
  return { api, ...view };
}

let announce: jest.SpyInstance;

beforeEach(() => {
  resetAppState();
  resetRouterMock();
  resetScanMocks();
  resetScanReviewOptions();
  pickLibrary.mockReset();
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(async () => {
  await scanRunner.idle();
  scanRunner.endScan();
  announce.mockRestore();
});

describe('Add cards with the card scan (screen 26)', () => {
  it('shows "Scan with camera" (New) and "Choose from photos" before the imports', async () => {
    readerOf({});
    renderAddCards();
    expect(await screen.findByRole('button', { name: 'Scan with camera, New' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose from photos' })).toBeOnTheScreen();
    expect(screen.getByTestId('add-cards-start')).toHaveTextContent(
      new RegExp(
        [
          'ADD MANY AT ONCE',
          'Scan with camera',
          'New',
          'Snap cards one after another\\. Yu-Gi-Oh! for now',
          'Choose from photos',
          'Pick photos you already took, one card per photo',
          'Import a deck',
          'Import from Collectr',
          'New cards start private\\. You choose what to publish\\.',
        ].join('.*')
      )
    );
    // R2's "Coming later" row gives way.
    expect(screen.queryByTestId('add-cards-scan')).toBeNull();
    expect(screen.queryByText('Coming later')).toBeNull();
  });

  it('keeps "Coming later" in a build without the reader (Expo Go, the web)', async () => {
    mockReader.provider = null;
    const { api } = renderAddCards();
    await waitFor(() => expect(api.callsTo('GET /api/v1/public/feature-flags')).toHaveLength(1));
    await act(async () => undefined);
    expect(screen.getByTestId('add-cards-scan')).toHaveTextContent(
      /Scan with camera.*Coming later/
    );
    expect(screen.queryByRole('button', { name: 'Choose from photos' })).toBeNull();
  });

  it('keeps "Coming later" while the flag is off', async () => {
    readerOf({});
    const { api } = renderAddCards({ cardTextScan: false, publicChat: true });
    await waitFor(() => expect(api.callsTo('GET /api/v1/public/feature-flags')).toHaveLength(1));
    await act(async () => undefined);
    expect(screen.getByTestId('add-cards-scan')).toHaveTextContent(
      /Scan with camera.*Coming later/
    );
    expect(screen.queryByRole('button', { name: 'Scan with camera, New' })).toBeNull();
  });

  it('"Scan with camera" opens the camera on a new scan', async () => {
    readerOf({});
    // A scan left from before (its photo is deleted when the new one starts).
    seedScan([{ photo: 'old', unread: READ_BLUR }]);
    renderAddCards();
    fireEvent.press(await screen.findByRole('button', { name: 'Scan with camera, New' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/scan');
    expect(useScanStore.getState().session.tiles).toEqual([]);
    expect(mockFiles.deleted).toEqual([libraryPhoto('old').uri]);
  });

  it('"Choose from photos" does nothing when the picker is cancelled, and says when it fails', async () => {
    readerOf({});
    pickLibrary.mockResolvedValueOnce({ canceled: true, assets: null });
    renderAddCards();
    fireEvent.press(await screen.findByRole('button', { name: 'Choose from photos' }));
    await waitFor(() => expect(pickLibrary).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(mockRouter.push).not.toHaveBeenCalled();

    pickLibrary.mockRejectedValueOnce(new Error('The picker could not open'));
    fireEvent.press(screen.getByRole('button', { name: 'Choose from photos' }));
    expect(await screen.findByText("Your photos couldn't be opened. Try again.")).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('Choose from photos, then the review', () => {
  it('picks up to 50 photos, opens the review, and fills it in as each photo is matched', async () => {
    readerOf({
      [libraryPhoto('yew').uri]: PHOTO_TEXT.yew,
      [libraryPhoto('lantern').uri]: PHOTO_TEXT.lantern,
    });
    // The matcher answers only when a test lets it.
    const held: (() => void)[] = [];
    const heldMatch = (request: MockRequest) =>
      new Promise<MockAnswer>((resolve) => {
        held.push(() => resolve(ok(answerFor(request.body as ScanRead))));
      });
    pickLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [libraryPhoto('yew'), libraryPhoto('lantern')].map((photo) => ({
        ...photo,
        type: 'image',
      })),
    });
    const api = mockApi(
      scanRoutes({
        'POST /api/v1/cards/scan-match': heldMatch,
        'GET /api/v1/public/feature-flags': ok({ cardTextScan: true }),
      })
    );
    const port = new FakeAuthPort(testUser());
    const addCards = renderWithProviders(<AddCardsScreen />, { port, scheme: 'dark' });

    fireEvent.press(await screen.findByRole('button', { name: 'Choose from photos' }));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/scan/review',
        params: { from: 'photos' },
      })
    );
    // Several at once, in the order picked, without EXIF, at most 50.
    expect(pickLibrary).toHaveBeenCalledWith({
      ...LIBRARY_PHOTO_OPTIONS,
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 50,
      exif: false,
    });
    addCards.unmount();

    mockParams.current = { from: 'photos' };
    renderWithProviders(<ScanReviewRoute />, { port, scheme: 'dark' });
    expect(await screen.findByTestId('review-summary')).toHaveTextContent('Reading 1 of 2…');
    expect(screen.getByTestId('review-reading')).toBeOnTheScreen();
    expect(screen.getByTestId('review-add')).toBeDisabled();

    await waitFor(() => expect(held).toHaveLength(2));
    act(() => held[0]?.());
    await waitFor(() =>
      expect(screen.getByTestId('review-summary')).toHaveTextContent('Reading 2 of 2…')
    );
    expect(screen.getByLabelText(`Check the match for ${YEW.name}`)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(`${YEW.name}, found`);

    act(() => held[1]?.());
    await waitFor(() =>
      expect(screen.getByTestId('review-summary')).toHaveTextContent('1 ready · 1 to check')
    );
    expect(screen.queryByTestId('review-reading')).toBeNull();
    expect(screen.getByText(LANTERN.name)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pick rarity' })).toBeOnTheScreen();
    expect(screen.getByTestId('review-add')).toBeEnabled();
    expect(api.callsTo('POST /api/v1/cards/scan-match')).toHaveLength(2);
  });
});
