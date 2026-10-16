import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { AccessibilityInfo, Linking } from 'react-native';

import ScanCameraRoute from '@/app/scan/index';
import { scanRunner } from '@/src/features/scan/scanRunner';
import { useScanStore } from '@/src/features/scan/scanStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { mockApi, ok, problem } from '../support/mockApi';
import { mockRouter, resetRouterMock } from '../support/router';
import { FOUND_YEW, YEW } from '../support/scanFixtures';
import {
  cameraPhoto,
  DENIED,
  libraryPhoto,
  mockCamera,
  mockFiles,
  PHOTO_TEXT,
  readerOf,
  resetScanMocks,
  scanRoutes,
  UNDETERMINED,
} from '../support/scanScreen';
import { renderWithProviders, resetAppState } from '../test-utils';

/**
 * Scan cards (mockup screen 27, owner spec 2026-10-15, sections 3.2 and 4): the camera, its tray
 * and its bottom bar, the camera permission, a phone without a camera, leaving, and the scan's
 * route when scanning is not available. The camera, the reader and the API are stand-ins: no
 * device, no network, fictional cards only.
 */

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
const mockLeave = { held: false, tryToLeave: () => undefined as void };
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (held: boolean, callback: (options: { data: { action: unknown } }) => void) => {
    mockLeave.held = held;
    mockLeave.tryToLeave = () => callback({ data: { action: { type: 'GO_BACK' } } });
  },
}));
jest.mock('expo-camera', () => require('../support/scanScreen').expoCameraMock());
jest.mock('@/src/features/scan/ocr/deviceOcr', () =>
  require('../support/scanScreen').deviceOcrMock()
);
jest.mock('expo-file-system', () => require('../support/scanScreen').fileSystemMock());
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const pickLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;

function pickerGives(names: string[]) {
  pickLibrary.mockResolvedValueOnce({
    canceled: false,
    assets: names.map((name) => ({ ...libraryPhoto(name), type: 'image' })),
  });
}

function render(routes = scanRoutes()) {
  const api = mockApi(routes);
  const view = renderWithProviders(<ScanCameraRoute />, {
    port: new FakeAuthPort(testUser()),
    scheme: 'dark',
  });
  return { api, ...view };
}

/** Lays the screen out as on a 390 × 844 phone: the frame finds its place and the shutter works. */
function layOut() {
  fireEvent(screen.getByTestId('screen-scan-camera'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
  });
  fireEvent(screen.getByTestId('scan-frame-slot'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 60, width: 390, height: 400 } },
  });
}

async function openCamera() {
  render();
  await screen.findByTestId('screen-scan-camera');
  layOut();
  await screen.findByTestId('scan-frame-overlay');
}

let announce: jest.SpyInstance;

beforeEach(() => {
  resetAppState();
  resetRouterMock();
  resetScanMocks();
  pickLibrary.mockReset();
  mockLeave.held = false;
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(async () => {
  jest.useRealTimers();
  await scanRunner.idle();
  scanRunner.endScan();
  onlineManager.setOnline(true);
  announce.mockRestore();
});

describe('the camera', () => {
  it('shows the title, the hint, the frame with its two areas, an empty tray and the bar', async () => {
    readerOf({});
    await openCamera();
    expect(screen.getByRole('header', { name: 'Scan cards' })).toBeTruthy();
    expect(screen.getByLabelText('Close the scanner')).toBeTruthy();
    expect(screen.getByLabelText('Light')).toBeTruthy();
    expect(screen.getByText('Fit the card in the frame, then tap the button.')).toBeTruthy();
    expect(screen.getByLabelText('Card frame: fit the whole card inside')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Set code')).toBeTruthy();
    expect(screen.getByText('THIS SCAN · 0')).toBeTruthy();
    // One element for the screen reader: the lock beside it is decorative.
    expect(screen.getByLabelText('Photos stay on your phone')).toBeTruthy();
    expect(screen.getByTestId('scan-tray-empty')).toBeTruthy();
    expect(screen.getByLabelText('Add photos you already took')).toBeTruthy();
    expect(screen.getByLabelText('Take the photo')).toBeEnabled();
    expect(screen.getByLabelText('Review 0')).toBeTruthy();
    expect(screen.getByText('Tip: tilt the card a little if the set code shines.')).toBeTruthy();
  });

  it("takes one photo per tap without waiting, reads the frame's areas, and groups a repeat (×2)", async () => {
    const reader = readerOf({
      [cameraPhoto('one').uri]: PHOTO_TEXT.yewInFrame,
      [cameraPhoto('two').uri]: PHOTO_TEXT.yewInFrame,
    });
    mockCamera.pictures = [cameraPhoto('one'), cameraPhoto('two')];
    await openCamera();
    fireEvent.press(screen.getByLabelText('Take the photo'));
    fireEvent.press(screen.getByLabelText('Take the photo'));
    await waitFor(() =>
      expect(screen.getByLabelText(`${YEW.name}, ZACR-EN036, found, 2 copies`)).toBeTruthy()
    );
    expect(screen.getByText('×2')).toBeTruthy();
    expect(screen.getByText('THIS SCAN · 2')).toBeTruthy();
    expect(screen.getByLabelText('Review 2')).toBeTruthy();
    // One still photo per tap, without EXIF; the Name and set code areas under the frame are read.
    expect(mockCamera.taken).toEqual([
      { exif: false, quality: 1 },
      { exif: false, quality: 1 },
    ]);
    const methods = reader.callsFor(cameraPhoto('one').uri).map((call) => call.method);
    expect(methods).toEqual(['recognizeName', 'recognizeSetCode']);
    // Each result is said by the screen reader.
    expect(announce).toHaveBeenCalledWith(`${YEW.name}, found`);
    expect(announce).toHaveBeenCalledWith(`${YEW.name}, found, 2 copies`);
  });

  it('keeps "Review {n}" beside the shutter: past its side of the bar, its arrow then its word go', async () => {
    readerOf({});
    await openCamera();
    const layout = (testID: string, width: number) =>
      fireEvent(screen.getByTestId(testID, { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width, height: 48 } },
      });
    // The pill measured out of sight is never seen nor heard.
    expect(screen.queryByTestId('scan-review-measure')).toBeNull();
    expect(screen.getByTestId('scan-review-word')).toHaveTextContent('Review');
    expect(screen.getByTestId('scan-review-arrow')).toBeTruthy();

    // A 375-point phone: its side of the bar is 116 points, 114 once the shutter's room is kept.
    layout('scan-review-side', 116);
    // At the default size the pill as drawn needs 133 points: the arrow goes.
    layout('scan-review-measure', 133);
    expect(screen.getByTestId('scan-review-word')).toHaveTextContent('Review');
    expect(screen.queryByTestId('scan-review-arrow')).toBeNull();
    // At the largest standard size it needs 155 (it reached 17 points over the shutter): the
    // word goes too, the count and arrow stay, and a screen reader still hears "Review 0".
    layout('scan-review-measure', 155);
    expect(screen.queryByTestId('scan-review-word')).toBeNull();
    expect(screen.getByTestId('scan-review-arrow')).toBeTruthy();
    expect(screen.getByLabelText('Review 0')).toBeTruthy();
    expect(screen.getByTestId('scan-review-count')).toHaveTextContent('0');
    expect(screen.getByLabelText('Take the photo')).toBeTruthy();
    // Room enough again: the mockup's pill.
    layout('scan-review-measure', 108);
    expect(screen.getByTestId('scan-review-word')).toHaveTextContent('Review');
    expect(screen.getByTestId('scan-review-arrow')).toBeTruthy();
  });

  it('turns the light on and off', async () => {
    readerOf({});
    await openCamera();
    const light = screen.getByLabelText('Light');
    await waitFor(() => expect(light).toBeEnabled());
    fireEvent.press(light);
    expect(mockCamera.torch).toBe(true);
    expect(screen.getByLabelText('Light').props.accessibilityState).toMatchObject({
      checked: true,
    });
    fireEvent.press(screen.getByLabelText('Light'));
    expect(mockCamera.torch).toBe(false);
  });
});

describe('the tray', () => {
  it('adds photos already taken with every status, newest first, and opens the review', async () => {
    readerOf({
      [libraryPhoto('yew').uri]: PHOTO_TEXT.yew,
      [libraryPhoto('lantern').uri]: PHOTO_TEXT.lantern,
      [libraryPhoto('fox').uri]: PHOTO_TEXT.fox,
      [libraryPhoto('blank').uri]: PHOTO_TEXT.blank,
    });
    pickerGives(['yew', 'lantern', 'fox', 'blank']);
    const { api } = render();
    await screen.findByTestId('screen-scan-camera');
    fireEvent.press(screen.getByLabelText('Add photos you already took'));
    await waitFor(() => expect(screen.getByText('THIS SCAN · 4')).toBeTruthy());
    expect(pickLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        allowsMultipleSelection: true,
        selectionLimit: 50,
        exif: false,
        mediaTypes: ['images'],
      })
    );
    const labels = screen
      .getAllByTestId(/^scan-tile-scan-\d+$/)
      .map((tile) => tile.props.accessibilityLabel as string);
    expect(labels).toEqual([
      "Couldn't read this card, tap to search",
      'Moonlit Paper Fox, set code unreadable, pick printing',
      'Endless Lantern, ZRA1-EN075, pick rarity',
      `${YEW.name}, ZACR-EN036, found`,
    ]);
    expect(screen.getByText('✓ Found')).toBeTruthy();
    expect(screen.getByText('Pick rarity')).toBeTruthy();
    expect(screen.getByText('Pick printing')).toBeTruthy();
    expect(screen.getByText('Code unreadable')).toBeTruthy();
    expect(screen.getByText("Couldn't read")).toBeTruthy();
    expect(screen.getByText('Tap to search')).toBeTruthy();
    // Only the text read went to the API, one call per photo that held text.
    expect(api.callsTo('POST /api/v1/cards/scan-match')).toHaveLength(3);

    fireEvent.press(screen.getByLabelText('Review 4'));
    expect(mockRouter.push).toHaveBeenCalledWith('/scan/review');
  });

  it('never groups unfinished tiles: two photos waiting for the connection stay two tiles', async () => {
    readerOf({
      [libraryPhoto('one').uri]: PHOTO_TEXT.yew,
      [libraryPhoto('two').uri]: PHOTO_TEXT.yew,
    });
    pickerGives(['one', 'two']);
    render(
      scanRoutes({
        'POST /api/v1/cards/scan-match': () => {
          throw new TypeError('Network request failed');
        },
      })
    );
    await screen.findByTestId('screen-scan-camera');
    onlineManager.setOnline(false);
    fireEvent.press(screen.getByLabelText('Add photos you already took'));
    await waitFor(() =>
      expect(
        screen.getAllByLabelText('A card waiting for connection, tap to try again')
      ).toHaveLength(2)
    );
    expect(screen.getAllByText('Waiting for connection')).toHaveLength(2);
    expect(screen.getAllByText('Tap to try again')).toHaveLength(2);
  });

  it('resolves the tiles waiting for the connection when it is back', async () => {
    readerOf({ [libraryPhoto('yew').uri]: PHOTO_TEXT.yew });
    pickerGives(['yew']);
    let online = false;
    render(
      scanRoutes({
        'POST /api/v1/cards/scan-match': (request) => {
          if (!online) {
            throw new TypeError('Network request failed');
          }
          return ok({ ...FOUND_YEW, read: request.body });
        },
      })
    );
    await screen.findByTestId('screen-scan-camera');
    onlineManager.setOnline(false);
    fireEvent.press(screen.getByLabelText('Add photos you already took'));
    await screen.findByLabelText('A card waiting for connection, tap to try again');
    expect(announce).toHaveBeenCalledWith('A card is waiting for connection');
    online = true;
    await act(async () => {
      onlineManager.setOnline(true);
    });
    await screen.findByLabelText(`${YEW.name}, ZACR-EN036, found`);
  });

  it('tries a waiting tile again when tapped, while the phone stayed online all along', async () => {
    readerOf({ [libraryPhoto('yew').uri]: PHOTO_TEXT.yew });
    pickerGives(['yew']);
    // The phone is online: only the API could not be reached (a server outage, a match that
    // timed out). The phone never says the connection is back.
    let reachable = false;
    const { api } = render(
      scanRoutes({
        'POST /api/v1/cards/scan-match': (request) => {
          if (!reachable) {
            throw new TypeError('Network request failed');
          }
          return ok({ ...FOUND_YEW, read: request.body });
        },
      })
    );
    await screen.findByTestId('screen-scan-camera');
    fireEvent.press(screen.getByLabelText('Add photos you already took'));
    const waiting = await screen.findByLabelText('A card waiting for connection, tap to try again');
    expect(waiting.props.accessibilityRole).toBe('button');
    expect(onlineManager.isOnline()).toBe(true);
    reachable = true;
    fireEvent.press(waiting);
    await screen.findByLabelText(`${YEW.name}, ZACR-EN036, found`);
    expect(announce).toHaveBeenCalledWith(`${YEW.name}, found`);
    expect(api.callsTo('POST /api/v1/cards/scan-match')).toHaveLength(2);
  });

  it('tries the waiting tiles again by itself on a timer, without a new photo', async () => {
    jest.useFakeTimers();
    readerOf({ [libraryPhoto('yew').uri]: PHOTO_TEXT.yew });
    pickerGives(['yew']);
    let reachable = false;
    render(
      scanRoutes({
        'POST /api/v1/cards/scan-match': (request) => {
          if (!reachable) {
            throw new TypeError('Network request failed');
          }
          return ok({ ...FOUND_YEW, read: request.body });
        },
      })
    );
    await screen.findByTestId('screen-scan-camera');
    fireEvent.press(screen.getByLabelText('Add photos you already took'));
    await screen.findByLabelText('A card waiting for connection, tap to try again');
    reachable = true;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(4_000);
    });
    expect(screen.getByLabelText('A card waiting for connection, tap to try again')).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    await screen.findByLabelText(`${YEW.name}, ZACR-EN036, found`);
  });
});

describe('reading', () => {
  it('shows "Reading…" on the photo while it is read and matched, then its result', async () => {
    readerOf({ [libraryPhoto('yew').uri]: PHOTO_TEXT.yew });
    pickerGives(['yew']);
    let answer: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (answer = resolve));
    render(
      scanRoutes({
        'POST /api/v1/cards/scan-match': async (request) => {
          await held;
          return ok({ ...FOUND_YEW, read: request.body });
        },
      })
    );
    await screen.findByTestId('screen-scan-camera');
    fireEvent.press(screen.getByLabelText('Add photos you already took'));
    expect(await screen.findByLabelText('Reading a card')).toBeTruthy();
    expect(screen.getByText('Reading…')).toBeTruthy();
    // A photo being read is not counted yet, and its tile cannot be tapped.
    expect(screen.getByText('THIS SCAN · 0')).toBeTruthy();
    expect(screen.getByLabelText('Reading a card').props.accessibilityRole).toBeUndefined();
    answer();
    await screen.findByLabelText(`${YEW.name}, ZACR-EN036, found`);
    expect(screen.getByText('THIS SCAN · 1')).toBeTruthy();
  });
});

describe('leaving', () => {
  it("asks first with cards in the tray, and deletes the scan's photos when it is left", async () => {
    readerOf({
      [libraryPhoto('yew').uri]: PHOTO_TEXT.yew,
      [libraryPhoto('blank').uri]: PHOTO_TEXT.blank,
    });
    pickerGives(['yew', 'blank']);
    render();
    await screen.findByTestId('screen-scan-camera');
    fireEvent.press(screen.getByLabelText('Add photos you already took'));
    await waitFor(() => expect(screen.getByText('THIS SCAN · 2')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Close the scanner'));
    expect(await screen.findByText('Leave without adding?')).toBeTruthy();
    expect(
      screen.getByText("The 2 cards in this scan won't be added to your inventory.")
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Keep scanning'));
    await waitFor(() => expect(screen.queryByText('Leave without adding?')).toBeNull());
    expect(mockRouter.back).not.toHaveBeenCalled();

    // The back gesture asks the same question.
    expect(mockLeave.held).toBe(true);
    act(() => mockLeave.tryToLeave());
    expect(await screen.findByText('Leave without adding?')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Keep scanning'));
    await waitFor(() => expect(screen.queryByText('Leave without adding?')).toBeNull());

    fireEvent.press(screen.getByLabelText('Close the scanner'));
    fireEvent.press(await screen.findByLabelText('Leave'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockFiles.deleted.sort()).toEqual(
      [libraryPhoto('blank').uri, libraryPhoto('yew').uri].sort()
    );
    expect(useScanStore.getState().session.tiles).toEqual([]);
  });

  it('leaves at once when the tray is empty', async () => {
    readerOf({});
    render();
    await screen.findByTestId('screen-scan-camera');
    fireEvent.press(screen.getByLabelText('Close the scanner'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(screen.queryByText('Leave without adding?')).toBeNull();
  });

  it('counts the photos still being read in the question', async () => {
    readerOf({
      [libraryPhoto('one').uri]: PHOTO_TEXT.yew,
      [libraryPhoto('two').uri]: PHOTO_TEXT.yew,
    });
    pickerGives(['one', 'two']);
    // The matcher holds its answers: both photos stay "Reading…".
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    render(
      scanRoutes({
        'POST /api/v1/cards/scan-match': async (request) => {
          await held;
          return ok({ ...FOUND_YEW, read: request.body });
        },
      })
    );
    await screen.findByTestId('screen-scan-camera');
    fireEvent.press(screen.getByLabelText('Add photos you already took'));
    await waitFor(() => expect(screen.getAllByLabelText('Reading a card')).toHaveLength(2));
    expect(screen.getByText('THIS SCAN · 0')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close the scanner'));
    expect(
      await screen.findByText("The 2 cards in this scan won't be added to your inventory.")
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Leave'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    release();
    await scanRunner.idle();
    // What the API answers for the scan that was left is dropped.
    expect(useScanStore.getState().session.tiles).toEqual([]);
  });

  it('deletes a photo still being taken when the scanner closes, and never reads it', async () => {
    const reader = readerOf({ [cameraPhoto('late').uri]: PHOTO_TEXT.yewInFrame });
    let hand: (picture: ReturnType<typeof cameraPhoto>) => void = () => undefined;
    mockCamera.pictures = [new Promise((resolve) => (hand = resolve))];
    const { api } = render();
    await screen.findByTestId('screen-scan-camera');
    layOut();
    await screen.findByTestId('scan-frame-overlay');
    fireEvent.press(screen.getByLabelText('Take the photo'));
    // The tray is still empty: Close leaves at once, and the scan ends.
    fireEvent.press(screen.getByLabelText('Close the scanner'));
    expect(mockRouter.back).toHaveBeenCalled();

    // The camera hands the photo over afterwards.
    await act(async () => {
      hand(cameraPhoto('late'));
    });
    await scanRunner.idle();
    expect(mockFiles.deleted).toEqual([cameraPhoto('late').uri]);
    expect(useScanStore.getState().session.tiles).toEqual([]);
    expect(reader.calls).toEqual([]);
    expect(api.callsTo('POST /api/v1/cards/scan-match')).toEqual([]);
  });
});

describe('the camera permission and the camera itself', () => {
  it('asks for the camera when it opens; refused: one line, Settings and "Choose from photos"', async () => {
    readerOf({ [libraryPhoto('yew').uri]: PHOTO_TEXT.yew });
    mockCamera.permission = UNDETERMINED;
    mockCamera.answer = DENIED;
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    render();
    expect(await screen.findByText('Allow the camera in Settings to scan cards.')).toBeTruthy();
    expect(mockCamera.request).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('scan-camera-view')).toBeNull();
    expect(screen.getByLabelText('Take the photo')).toBeDisabled();
    fireEvent.press(screen.getByText('Open Settings'));
    expect(settings).toHaveBeenCalled();
    pickerGives(['yew']);
    fireEvent.press(screen.getByLabelText('Choose from photos'));
    await screen.findByLabelText(`${YEW.name}, ZACR-EN036, found`);
    settings.mockRestore();
  });

  it('never asks again once the camera was refused', async () => {
    readerOf({});
    mockCamera.permission = DENIED;
    render();
    expect(await screen.findByText('Allow the camera in Settings to scan cards.')).toBeTruthy();
    expect(mockCamera.request).not.toHaveBeenCalled();
  });

  it('says there is no camera on a phone without one (the simulator), and offers the photos', async () => {
    readerOf({});
    mockCamera.lenses = [];
    render();
    expect(
      await screen.findByText('There is no camera here. Choose photos you already took.')
    ).toBeTruthy();
    expect(screen.queryByTestId('scan-camera-view')).toBeNull();
    expect(screen.getByLabelText('Take the photo')).toBeDisabled();
    expect(screen.getByLabelText('Choose from photos')).toBeTruthy();
  });

  it('offers "Try again" when the camera did not start', async () => {
    readerOf({});
    mockCamera.mountError = true;
    render();
    expect(await screen.findByText("The camera didn't start.")).toBeTruthy();
    mockCamera.mountError = false;
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.queryByText("The camera didn't start.")).toBeNull());
    expect(screen.getByTestId('scan-camera-view')).toBeTruthy();
  });
});

describe('where the scan cannot run', () => {
  it('says so when this build has no reader (Expo Go, the web), without opening the camera', async () => {
    render();
    expect(await screen.findByText("Scanning isn't available here")).toBeTruthy();
    expect(
      screen.getByText(
        'This version of the app cannot read cards. Add them by name or code from Add cards.'
      )
    ).toBeTruthy();
    expect(screen.queryByTestId('screen-scan-camera')).toBeNull();
    fireEvent.press(screen.getByText('Back to Add cards'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('says so when the flag cardTextScan is off', async () => {
    readerOf({});
    render(scanRoutes({ 'GET /api/v1/public/feature-flags': ok({ cardTextScan: false }) }));
    expect(
      await screen.findByText(
        'Scanning is turned off for now. Add cards by name or code from Add cards.'
      )
    ).toBeTruthy();
    expect(screen.queryByTestId('screen-scan-camera')).toBeNull();
  });

  it('waits for the flags, and offers "Try again" when they cannot be read', async () => {
    readerOf({});
    const { api } = render(
      scanRoutes({
        'GET /api/v1/public/feature-flags': [
          problem(500, 'INTERNAL_ERROR', 'Something went wrong'),
          ok({ cardTextScan: true }),
        ],
      })
    );
    expect(screen.getByTestId('scan-loading')).toBeTruthy();
    expect(await screen.findByText("We couldn't check whether scanning is on.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('scan-flags-error-retry'));
    expect(await screen.findByTestId('screen-scan-camera')).toBeTruthy();
    expect(api.callsTo('GET /api/v1/public/feature-flags').length).toBeGreaterThanOrEqual(2);
  });
});
