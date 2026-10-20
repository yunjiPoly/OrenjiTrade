import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as Crypto from 'expo-crypto';
import { AccessibilityInfo, AppState, Dimensions, type AppStateStatus } from 'react-native';

import ScanCameraRoute from '@/app/scan/index';
import ScanReviewRoute from '@/app/scan/review';
import { REVIEW_COPY } from '@/src/features/scan/scanCopy';
import { scanRunner } from '@/src/features/scan/scanRunner';
import { resetScanReviewOptions } from '@/src/features/scan/scanReviewOptions';
import { findTile, removeTile, setCopies } from '@/src/features/scan/scanSession';
import { useScanStore } from '@/src/features/scan/scanStore';
import { PINNED_MAX_FONT_SCALE } from '@/src/theme';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { binderFixture } from '../support/fixtures';
import { mockApi, ok, problem, type MockAnswer, type MockRoutes } from '../support/mockApi';
import { mockDispatch, mockParams, mockRouter, resetRouterMock } from '../support/router';
import { FOUND_YEW, LANTERN, LYRA, READ_YEW, YEW } from '../support/scanFixtures';
import {
  libraryPhoto,
  mockFiles,
  mockFocus,
  PHOTO_TEXT,
  readerOf,
  resetScanMocks,
  scanRoutes,
} from '../support/scanScreen';
import { FOUND_LYRA, READ_BLUR, READ_LYRA, seedMockupScan, seedScan } from '../support/scanSeed';
import { renderWithProviders, resetAppState } from '../test-utils';

/**
 * Review (mockup screen 30, owner spec 2026-10-15, section 4): "To check" above "Ready", each row's
 * fix, the pills, the warning, "Add {n} cards to inventory" and its refusals. The scan is put in
 * the store directly (fictional cards and photo names); the API is the fake one.
 */

jest.mock('expo-router', () => ({
  ...require('../support/router').expoRouterMock(),
  // The screens' focus: the review tries the waiting cards again when it comes into view.
  useFocusEffect: require('../support/scanScreen').useFocusEffectMock,
}));
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

const ADDED = {
  itemsCreated: 2,
  itemsRaised: 0,
  copiesAdded: 3,
  copiesNotAdded: 0,
  createdItemIds: ['item-yew', 'item-lyra'],
  raisedItemIds: [],
};

function render(routes: MockRoutes = {}) {
  const api = mockApi(
    scanRoutes({
      'POST /api/v1/inventory/items/batch': ok(ADDED),
      ...routes,
    })
  );
  const view = renderWithProviders(<ScanReviewRoute />, {
    port: new FakeAuthPort(testUser()),
    scheme: 'dark',
  });
  return { api, ...view };
}

const addButton = () => screen.getByTestId('review-add');

/** A new UUID each time it is asked for (request ids use them too). */
function countUuids() {
  let made = 0;
  (Crypto.randomUUID as jest.Mock).mockImplementation(
    () => `00000000-0000-4000-8000-${String((made += 1)).padStart(12, '0')}`
  );
}

let announce: jest.SpyInstance;

beforeEach(() => {
  resetAppState();
  resetRouterMock();
  resetScanMocks();
  resetScanReviewOptions();
  mockLeave.held = false;
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(async () => {
  jest.useRealTimers();
  await scanRunner.idle();
  scanRunner.endScan();
  announce.mockRestore();
  (Crypto.randomUUID as jest.Mock).mockImplementation(() => '00000000-0000-4000-8000-000000000000');
});

describe('the review', () => {
  it('lists the cards to check above the ready ones, with their counts and fixes', async () => {
    seedMockupScan();
    render();
    expect(await screen.findByRole('header', { name: 'Review 6 cards' })).toBeOnTheScreen();
    // Amber while something is left to check (the R1 warning colour).
    expect(screen.getByTestId('review-summary')).toHaveTextContent('3 ready · 3 to check');
    expect(screen.getByTestId('review-summary')).toHaveStyle({ color: '#FBBF24' });
    expect(screen.getByLabelText('Back to scanning')).toBeOnTheScreen();

    const list = screen.getByTestId('screen-scan-review-scroll');
    // "To check · 3" sits above "Ready · 3", newest first in each group.
    expect(list).toHaveTextContent(
      new RegExp(
        [
          'TO CHECK · 3',
          "Couldn't read",
          'Search by name or code',
          'Moonlit Paper Fox',
          'Set code not readable',
          'Pick printing',
          'Endless Lantern',
          'ZRA1-EN075',
          'Pick rarity',
          'READY · 3',
          LYRA.name,
          'ZACR-EN038',
          'Super Rare',
          YEW.name,
          'ZACR-EN036',
          'Secret Rare',
        ].join('.*')
      )
    );
    // A ready row opens 28, and says its code and rarity.
    const yew = screen.getByLabelText(`Check the match for ${YEW.name}`);
    expect(yew.props.accessibilityValue).toEqual({ text: 'ZACR-EN036, Secret Rare' });
    // Copies and remove on every row with a card; none on the photo that could not be read.
    expect(screen.getAllByLabelText('One more')).toHaveLength(4);
    expect(screen.getByLabelText(`Remove ${YEW.name}`)).toBeOnTheScreen();
    // A row with no card yet is not named after its status.
    expect(screen.getByTestId('review-row-scan-6-remove')).toHaveProp(
      'accessibilityLabel',
      'Remove this card'
    );
    expect(screen.getByTestId('review-row-scan-1-copies')).toHaveTextContent('2');

    expect(screen.getByTestId('review-warning')).toHaveTextContent(
      "The 3 cards to check won't be added."
    );
    expect(screen.getByLabelText('Private: only you see them. Change')).toBeOnTheScreen();
    expect(screen.getByLabelText('Binder: no binder')).toBeOnTheScreen();
    expect(addButton()).toHaveTextContent(/Add 3 cards to inventory/);
    expect(addButton()).toBeEnabled();
    expect(
      screen.getByText('Add prices and photos later by tapping a card in Inventory.')
    ).toBeOnTheScreen();
  });

  it('says "Nothing scanned yet" and "Nothing ready to add" with nothing to add', async () => {
    render();
    expect(await screen.findByRole('header', { name: 'Review 0 cards' })).toBeOnTheScreen();
    expect(screen.getByTestId('review-summary')).toHaveTextContent('Nothing scanned yet');
    expect(screen.getByTestId('review-empty')).toBeOnTheScreen();
    expect(addButton()).toHaveTextContent(/Nothing ready to add/);
    expect(addButton()).toBeDisabled();
    expect(screen.queryByTestId('review-warning')).toBeNull();

    // One photo that could not be read: one card to check, nothing ready.
    act(() => {
      seedScan([{ photo: 'blur', unread: READ_BLUR }]);
    });
    expect(screen.getByTestId('review-summary')).toHaveTextContent('0 ready · 1 to check');
    expect(screen.getByTestId('review-warning')).toHaveTextContent(
      "The card to check won't be added."
    );
    expect(addButton()).toBeDisabled();
  });

  it('opens each fix in place: 28, the rarity list, the printing list and the search', async () => {
    const ids = seedMockupScan();
    render();
    await screen.findByRole('header', { name: 'Review 6 cards' });

    fireEvent.press(screen.getByLabelText(`Check the match for ${YEW.name}`));
    expect(await screen.findByTestId('scan-check-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('scan-check-name')).toHaveTextContent(YEW.name);
    fireEvent.press(screen.getByTestId('scan-check-close'));
    await waitFor(() => expect(screen.queryByTestId('scan-check-sheet')).toBeNull());

    fireEvent.press(screen.getByTestId(`review-row-${ids.lantern}-pick-rarity`));
    const rarities = await screen.findByTestId('scan-rarity-sheet');
    expect(rarities).toHaveTextContent(
      `${LANTERN.name} · ZRA1-EN075. This code comes in 3 rarities: pick the one on your card.`,
      { exact: false }
    );
    fireEvent.press(screen.getByRole('radio', { name: 'Ultra Rare' }));
    await waitFor(() => expect(screen.queryByTestId('scan-rarity-sheet')).toBeNull());
    // Picked: the card is ready (4 ready, 2 to check).
    expect(screen.getByTestId('review-summary')).toHaveTextContent('4 ready · 2 to check');

    fireEvent.press(screen.getByTestId(`review-row-${ids.fox}-pick-printing`));
    expect(await screen.findByTestId('scan-printing-sheet')).toHaveTextContent(
      /Pick the printing.*Moonlit Paper Fox\. We couldn’t read its set code/
    );
    fireEvent.press(screen.getByTestId('scan-printing-row-ZDUP-EN077'));
    await waitFor(() => expect(screen.queryByTestId('scan-printing-sheet')).toBeNull());
    expect(screen.getByTestId('review-summary')).toHaveTextContent('5 ready · 1 to check');

    fireEvent.press(screen.getByTestId(`review-row-${ids.blur}-search`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/scan/search',
      params: { tileId: ids.blur },
    });
  });

  it('changes the copies of a row and removes a row', async () => {
    const ids = seedMockupScan();
    render();
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(screen.getByTestId(`review-row-${ids.lyra}-more`));
    expect(screen.getByTestId(`review-row-${ids.lyra}-copies`)).toHaveTextContent('2');
    expect(screen.getByRole('header', { name: 'Review 7 cards' })).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId(`review-row-${ids.lyra}-less`));
    expect(screen.getByTestId(`review-row-${ids.lyra}-less`)).toBeDisabled();

    fireEvent.press(screen.getByTestId(`review-row-${ids.blur}-remove`));
    expect(screen.queryByTestId(`review-row-${ids.blur}`)).toBeNull();
    // Its photo is deleted at once, not at the end of the scan.
    await waitFor(() => expect(mockFiles.deleted).toEqual([libraryPhoto('blur').uri]));
    expect(screen.getByTestId('review-summary')).toHaveTextContent('3 ready · 2 to check');
    expect(screen.getByTestId('review-warning')).toHaveTextContent(
      "The 2 cards to check won't be added."
    );
  });
});

describe('a row', () => {
  it('stops at 99 copies: "One more" is off', async () => {
    const ids = seedMockupScan();
    act(() => {
      useScanStore.getState().apply((session) => setCopies(session, ids.lyra, 98));
    });
    render();
    await screen.findByRole('header', { name: /^Review \d+ cards$/ });
    const more = screen.getByTestId(`review-row-${ids.lyra}-more`);
    expect(more).toBeEnabled();
    fireEvent.press(more);
    expect(screen.getByTestId(`review-row-${ids.lyra}-copies`)).toHaveTextContent('99');
    expect(screen.getByTestId(`review-row-${ids.lyra}-more`)).toBeDisabled();
  });

  it('tries the cards waiting for the connection again as soon as the review opens', async () => {
    jest.useFakeTimers();
    seedScan([{ photo: 'yew-1', waiting: READ_YEW }]);
    const { api } = render({
      'POST /api/v1/cards/scan-match': ok({ ...FOUND_YEW, read: READ_YEW }),
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    // No tap, and long before the timer's first try (5 s).
    expect(api.callsTo('POST /api/v1/cards/scan-match')).toHaveLength(1);
    expect(screen.getByTestId('review-summary')).toHaveTextContent('1 ready');
  });

  it('waiting for the connection offers "Try again": the tap alone asks again, the row stays while it is tried', async () => {
    jest.useFakeTimers();
    const [, waiting = ''] = seedScan([
      { photo: 'lyra', match: FOUND_LYRA },
      { photo: 'yew-1', waiting: READ_YEW },
    ]);
    let answer: (value: MockAnswer) => void = () => undefined;
    const { api } = render({
      'POST /api/v1/cards/scan-match': [
        // The try when the review opens: still no connection.
        () => {
          throw new TypeError('Network request failed');
        },
        // "Try again": an answer that takes its time.
        () => new Promise<MockAnswer>((resolve) => (answer = resolve)),
      ],
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(api.callsTo('POST /api/v1/cards/scan-match')).toHaveLength(1);
    expect(screen.getByTestId(`review-row-${waiting}`)).toHaveTextContent(/Waiting for connection/);
    expect(screen.getByTestId(`review-row-${waiting}-remove`)).toHaveProp(
      'accessibilityLabel',
      'Remove this card'
    );
    // The search is one tap away, for a card that waits too.
    fireEvent.press(screen.getByTestId(`review-row-${waiting}-search`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/scan/search',
      params: { tileId: waiting },
    });
    // Said once when it began to wait, not at each try that changed nothing.
    expect(announce).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    // The tap asked at once: no timer had to fire.
    expect(api.callsTo('POST /api/v1/cards/scan-match')).toHaveLength(2);
    // While it is tried the row stays as it is: no "Reading…", the counts and the add unchanged.
    const retry = screen.getByTestId(`review-row-${waiting}-retry`);
    expect(retry).toHaveTextContent('Trying again…');
    expect(retry).toBeDisabled();
    expect(retry.props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.getByTestId(`review-row-${waiting}`)).toHaveTextContent(/Waiting for connection/);
    expect(screen.queryByTestId('review-reading')).toBeNull();
    expect(screen.getByTestId('review-summary')).toHaveTextContent('1 ready · 1 to check');
    expect(addButton()).toHaveTextContent(/Add 1 card to inventory/);
    expect(addButton()).toBeEnabled();

    await act(async () => {
      answer(ok({ ...FOUND_YEW, read: READ_YEW }));
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('review-summary')).toHaveTextContent('2 ready');
    expect(announce).toHaveBeenCalledWith(`${YEW.name}, found`);
  });

  it('tries the waiting cards again when the app comes back to the front', async () => {
    jest.useFakeTimers();
    // AppState is jest's stand-in: the screens' listeners are in its calls.
    const addListener = AppState.addEventListener as unknown as jest.Mock;
    const before = addListener.mock.calls.length;
    seedScan([{ photo: 'yew-1', waiting: READ_YEW }]);
    const { api } = render({
      'POST /api/v1/cards/scan-match': [
        () => {
          throw new TypeError('Network request failed');
        },
        ok({ ...FOUND_YEW, read: READ_YEW }),
      ],
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(api.callsTo('POST /api/v1/cards/scan-match')).toHaveLength(1);
    const changes = addListener.mock.calls
      .slice(before)
      .filter(([type]) => type === 'change')
      .map(([, listener]) => listener as (status: AppStateStatus) => void);
    expect(changes.length).toBeGreaterThan(0);
    await act(async () => {
      changes.forEach((change) => change('active'));
      await jest.advanceTimersByTimeAsync(0);
    });
    // Back in front: tried at once, long before the timer's first try.
    expect(api.callsTo('POST /api/v1/cards/scan-match')).toHaveLength(2);
    expect(screen.getByTestId('review-summary')).toHaveTextContent('1 ready');
  });

  it('with the camera still under it, the result of a photo is said once, by the review', async () => {
    readerOf({ [libraryPhoto('yew-1').uri]: PHOTO_TEXT.yew });
    const api = mockApi(scanRoutes());
    renderWithProviders(<ScanCameraRoute />, {
      port: new FakeAuthPort(testUser()),
      scheme: 'dark',
    });
    await screen.findByTestId('screen-scan-camera');
    // The review is pushed over the camera: the camera loses the focus, and stays mounted.
    act(() => mockFocus.blurAll());
    renderWithProviders(<ScanReviewRoute />, {
      port: new FakeAuthPort(testUser()),
      scheme: 'dark',
    });
    await screen.findByRole('header', { name: 'Review 0 cards' });
    act(() => {
      scanRunner.addPhotos([
        { photo: { ...libraryPhoto('yew-1'), owned: true }, source: 'LIBRARY' },
      ]);
    });
    await waitFor(() => expect(screen.getByTestId('review-summary')).toHaveTextContent('1 ready'));
    expect(api.callsTo('POST /api/v1/cards/scan-match')).toHaveLength(1);
    expect(announce.mock.calls.filter(([text]) => text === `${YEW.name}, found`)).toHaveLength(1);
  });
});

describe('adding', () => {
  it('adds only the ready cards, Private and in no binder, then opens Inventory with the toast', async () => {
    seedMockupScan();
    const { api } = render();
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(addButton());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/inventory'));
    expect(api.callsTo('POST /api/v1/inventory/items/batch')).toHaveLength(1);
    expect(api.callsTo('POST /api/v1/inventory/items/batch')[0]?.body).toEqual({
      visibility: 'PRIVATE',
      lines: [
        { printingId: FOUND_YEW.printing?.id, quantity: 2 },
        { printingId: FOUND_LYRA.printing?.id, quantity: 1 },
      ],
    });
    expect(await screen.findByText('Saved · 3 cards')).toBeOnTheScreen();
    // The scan ended: its photos are deleted and the tray is empty.
    expect(useScanStore.getState().session.tiles).toEqual([]);
    expect(mockFiles.deleted.sort()).toEqual(
      ['yew-1', 'yew-2', 'lyra', 'lantern', 'fox', 'blur']
        .map((name) => libraryPhoto(name).uri)
        .sort()
    );
  });

  it('sends no binder once the binder picked is gone from the list', async () => {
    seedMockupScan();
    let binders = [binderFixture()];
    const { api, queryClient } = render({ 'GET /api/v1/binders': () => ok(binders) });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(screen.getByLabelText('Binder: no binder'));
    const sheet = await screen.findByTestId('review-binder-sheet');
    fireEvent.press(await within(sheet).findByRole('radio', { name: 'Trade binder, Private' }));
    await waitFor(() => expect(screen.getByLabelText('Binder: Trade binder')).toBeOnTheScreen());

    // Deleted on another screen meanwhile: the list read again no longer has it.
    binders = [];
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() => expect(screen.getByLabelText('Binder: no binder')).toBeOnTheScreen());
    fireEvent.press(addButton());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/inventory'));
    expect(api.callsTo('POST /api/v1/inventory/items/batch')[0]?.body).not.toHaveProperty(
      'binderId'
    );
  });

  it('adds them Public and in the binder picked', async () => {
    seedMockupScan();
    const { api } = render({
      'GET /api/v1/binders': ok([
        binderFixture(),
        binderFixture({ id: 'binder-open', name: 'Open binder', visibility: 'PUBLIC' }),
      ]),
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(screen.getByLabelText('Private: only you see them. Change'));
    expect(
      screen.getByLabelText('Public: collectors in your region can find them. Change')
    ).toHaveTextContent(/Public/);

    fireEvent.press(screen.getByLabelText('Binder: no binder'));
    const sheet = await screen.findByTestId('review-binder-sheet');
    await within(sheet).findByTestId('review-binder-list');
    expect(within(sheet).getByRole('radio', { name: 'No binder' })).toBeChecked();
    // A private binder is said to be private.
    expect(within(sheet).getByRole('radio', { name: 'Trade binder, Private' })).toBeOnTheScreen();
    fireEvent.press(within(sheet).getByRole('radio', { name: 'Open binder' }));
    await waitFor(() => expect(screen.queryByTestId('review-binder-sheet')).toBeNull());
    expect(screen.getByLabelText('Binder: Open binder')).toHaveTextContent(/Open binder/);

    fireEvent.press(addButton());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/inventory'));
    expect(api.callsTo('POST /api/v1/inventory/items/batch')[0]?.body).toMatchObject({
      visibility: 'PUBLIC',
      binderId: 'binder-open',
    });
  });

  it('keeps the pills when the review opens again, and a new scan starts Private', async () => {
    seedMockupScan();
    const first = render();
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(screen.getByLabelText('Private: only you see them. Change'));
    first.unmount();

    render();
    expect(
      await screen.findByLabelText('Public: collectors in your region can find them. Change')
    ).toBeOnTheScreen();
    act(() => {
      scanRunner.endScan();
    });
    expect(screen.getByLabelText('Private: only you see them. Change')).toBeOnTheScreen();
  });

  it('explains a reached limit, keeps every card, and adds once there is room', async () => {
    seedMockupScan();
    const { api } = render({
      'POST /api/v1/inventory/items/batch': [
        problem(429, 'LIMIT_REACHED', 'You have reached the limit of your plan for this action', {
          limitKey: 'inventory.items.max',
          limit: 500,
          used: 499,
          requested: 2,
        }),
        ok(ADDED),
      ],
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(addButton());
    const notice = await screen.findByTestId('review-limit');
    expect(notice).toHaveTextContent(/Your inventory is full/);
    expect(screen.getByTestId('review-limit-message')).toHaveTextContent(
      'Your inventory holds at most 500 cards and has 499. These cards need 2 new places and 1 is left. Nothing was added: remove some cards here, or delete cards you no longer have in Inventory, then add again.'
    );
    // Said to the screen reader too, title first.
    expect(announce).toHaveBeenLastCalledWith(
      'Your inventory is full. Your inventory holds at most 500 cards and has 499. These cards need 2 new places and 1 is left. Nothing was added: remove some cards here, or delete cards you no longer have in Inventory, then add again.'
    );
    // Nothing was added: the scan and its photos are kept, the screen stays.
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(useScanStore.getState().session.tiles).toHaveLength(5);
    expect(mockFiles.deleted).toEqual([]);
    expect(addButton()).toBeEnabled();

    fireEvent.press(addButton());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/inventory'));
    expect(api.callsTo('POST /api/v1/inventory/items/batch')).toHaveLength(2);
  });

  it('says what went wrong above the button, and to the screen reader: the binder gone, adding off, anything else', async () => {
    countUuids();
    seedMockupScan();
    const { api } = render({
      'POST /api/v1/inventory/items/batch': [
        problem(404, 'NOT_FOUND', 'Binder not found'),
        problem(404, 'FEATURE_DISABLED', 'Feature is disabled', { feature: 'cardTextScan' }),
        problem(400, 'VALIDATION_FAILED', 'Unknown printing.'),
      ],
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    const footer = screen.getByTestId('screen-scan-review-footer');

    // A binder deleted meanwhile: back to "No binder".
    fireEvent.press(screen.getByLabelText('Binder: no binder'));
    const sheet = await screen.findByTestId('review-binder-sheet');
    fireEvent.press(await within(sheet).findByRole('radio', { name: 'Trade binder, Private' }));
    await waitFor(() => expect(screen.getByLabelText('Binder: Trade binder')).toBeOnTheScreen());
    fireEvent.press(addButton());
    const gone =
      'That binder is gone. Nothing was added: pick another binder, or No binder, and add again.';
    await waitFor(() =>
      expect(within(footer).getByTestId('review-add-error-message')).toHaveTextContent(gone)
    );
    expect(announce).toHaveBeenLastCalledWith(gone);
    expect(screen.getByLabelText('Binder: no binder')).toBeOnTheScreen();

    fireEvent.press(addButton());
    const off =
      'Adding scanned cards is turned off for now. Nothing was added: add them by name or code from Add cards.';
    await waitFor(() =>
      expect(within(footer).getByTestId('review-add-error-message')).toHaveTextContent(off)
    );
    expect(announce).toHaveBeenLastCalledWith(off);

    fireEvent.press(addButton());
    const other = 'Unknown printing. Nothing was added: try again.';
    await waitFor(() =>
      expect(within(footer).getByTestId('review-add-error-message')).toHaveTextContent(other)
    );
    expect(announce).toHaveBeenLastCalledWith(other);
    // Refused each time: nothing was added, nothing left the scan, nothing is "Not confirmed yet".
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(mockFiles.deleted).toEqual([]);
    expect(screen.queryByText('Not confirmed yet')).toBeNull();
    // Each refused add was a new add: its own key.
    const keys = api
      .callsTo('POST /api/v1/inventory/items/batch')
      .map((call) => call.headers.get('Idempotency-Key'));
    expect(keys).toHaveLength(3);
    expect(keys[0]).toMatch(/^scan-[0-9a-f-]{36}$/);
    expect(new Set(keys).size).toBe(3);
  });

  it('without an answer, keeps what it sent: "Not confirmed yet", the pills locked, then the same add again before the cards fixed since', async () => {
    countUuids();
    const ids = seedMockupScan();
    const { api } = render({
      'POST /api/v1/inventory/items/batch': [
        () => {
          throw new TypeError('Network request failed');
        },
        // The same add again: the API repeats its first answer (it went through meanwhile).
        ok(ADDED),
        // Then the card fixed since.
        ok({ ...ADDED, itemsCreated: 1, copiesAdded: 1, createdItemIds: ['item-lantern'] }),
      ],
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(screen.getByLabelText('Private: only you see them. Change'));
    fireEvent.press(addButton());
    const unsure =
      "We couldn't hear back from OrenjiTrade, so we can't tell whether your cards were added. They stay as they were sent: add again when you're online, and nothing will be added twice.";
    const footer = screen.getByTestId('screen-scan-review-footer');
    expect(await within(footer).findByTestId('review-add-error-message')).toHaveTextContent(unsure);
    expect(announce).toHaveBeenLastCalledWith(unsure);

    // What was sent stays as it was sent: no copy changed, no Remove, no check of the match.
    for (const id of [ids.yew, ids.lyra]) {
      expect(screen.getByTestId(`review-row-${id}-not-confirmed`)).toHaveTextContent(
        'Not confirmed yet'
      );
      expect(screen.getByTestId(`review-row-${id}-more`)).toBeDisabled();
      expect(screen.getByTestId(`review-row-${id}-less`)).toBeDisabled();
      expect(screen.queryByTestId(`review-row-${id}-remove`)).toBeNull();
      expect(screen.queryByTestId(`review-row-${id}-open`)).toBeNull();
    }
    // The pills show what was sent and stay as they are.
    const visibility = screen.getByLabelText(
      'Public: collectors in your region can find them. Change'
    );
    expect(visibility).toBeDisabled();
    fireEvent.press(visibility);
    expect(
      screen.getByLabelText('Public: collectors in your region can find them. Change')
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Binder: no binder')).toBeDisabled();
    // A card fixed meanwhile is ready, and added after the add sent before.
    fireEvent.press(screen.getByTestId(`review-row-${ids.lantern}-pick-rarity`));
    await screen.findByTestId('scan-rarity-sheet');
    fireEvent.press(screen.getByRole('radio', { name: 'Ultra Rare' }));
    await waitFor(() => expect(screen.queryByTestId('scan-rarity-sheet')).toBeNull());
    expect(screen.getByTestId('review-summary')).toHaveTextContent('4 ready · 2 to check');
    expect(addButton()).toHaveTextContent(/Add 4 cards to inventory/);

    fireEvent.press(addButton());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/inventory'));
    const calls = api.callsTo('POST /api/v1/inventory/items/batch');
    expect(calls).toHaveLength(3);
    // The same body under the same key: what was sent can never change on the way.
    expect(calls[1]?.body).toEqual(calls[0]?.body);
    expect(calls[0]?.body).toEqual({
      visibility: 'PUBLIC',
      lines: [
        { printingId: FOUND_YEW.printing?.id, quantity: 2 },
        { printingId: FOUND_LYRA.printing?.id, quantity: 1 },
      ],
    });
    const keys = calls.map((call) => call.headers.get('Idempotency-Key'));
    expect(keys[1]).toBe(keys[0]);
    // The card fixed since: an add of its own, under a new key.
    expect(keys[2]).not.toBe(keys[0]);
    expect(calls[2]?.body).toEqual({
      visibility: 'PUBLIC',
      lines: [{ printingId: 'p-zra1-075-u', quantity: 1 }],
    });
    expect(await screen.findByText('Saved · 4 cards')).toBeOnTheScreen();
  });

  it('opened again with an add not confirmed, says so again above the button', async () => {
    seedMockupScan();
    const first = render({
      'POST /api/v1/inventory/items/batch': () => {
        throw new TypeError('Network request failed');
      },
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(addButton());
    await screen.findByTestId('review-add-error');
    first.unmount();

    // Back to scanning, then Review again: a new review of the same scan.
    render();
    await screen.findByRole('header', { name: 'Review 6 cards' });
    expect(screen.getByTestId('review-add-error-message')).toHaveTextContent(REVIEW_COPY.unsure);
    expect(screen.getAllByText('Not confirmed yet')).toHaveLength(2);
  });

  it('answered while other cards are left to add: exactly the cards it sent leave, their photos are deleted', async () => {
    countUuids();
    const ids = seedMockupScan();
    render({
      'POST /api/v1/inventory/items/batch': [
        () => {
          throw new TypeError('Network request failed');
        },
        ok(ADDED),
        problem(429, 'LIMIT_REACHED', 'You have reached the limit for this action', {
          limitKey: 'inventory.items.max',
          limit: 500,
          used: 500,
          requested: 1,
        }),
      ],
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(addButton());
    await screen.findByTestId('review-add-error');
    fireEvent.press(screen.getByTestId(`review-row-${ids.lantern}-pick-rarity`));
    await screen.findByTestId('scan-rarity-sheet');
    fireEvent.press(screen.getByRole('radio', { name: 'Ultra Rare' }));
    await waitFor(() => expect(screen.queryByTestId('scan-rarity-sheet')).toBeNull());

    fireEvent.press(addButton());
    const footer = screen.getByTestId('screen-scan-review-footer');
    await within(footer).findByTestId('review-limit');
    // The add sent before went through: its cards left the scan, with their photos only.
    expect(await screen.findByText('Saved · 3 cards')).toBeOnTheScreen();
    expect(screen.queryByTestId(`review-row-${ids.yew}`)).toBeNull();
    expect(screen.queryByTestId(`review-row-${ids.lyra}`)).toBeNull();
    expect(mockFiles.deleted.sort()).toEqual(
      ['yew-1', 'yew-2', 'lyra'].map((name) => libraryPhoto(name).uri).sort()
    );
    // The card refused stays, and can be changed: the limit added nothing.
    expect(screen.getByTestId(`review-row-${ids.lantern}-more`)).toBeEnabled();
    expect(screen.queryByText('Not confirmed yet')).toBeNull();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(
      useScanStore
        .getState()
        .session.tiles.map((tile) => tile.id)
        .sort()
    ).toEqual([ids.lantern, ids.fox, ids.blur].sort());
    // Said last, with what was saved: the toast's own words do not cut it off.
    expect(announce).toHaveBeenLastCalledWith(
      `Saved · 3 cards. Your inventory is full. Your inventory holds at most 500 cards and has 500. These cards need 1 new place and 0 are left. Nothing was added: remove some cards here, or delete cards you no longer have in Inventory, then add again.`
    );
  });

  it('keeps a card that became ready while the add was on its way, for the next add', async () => {
    countUuids();
    const [yew = '', lyra = ''] = seedScan([
      { photo: 'yew-1', match: FOUND_YEW },
      { photo: 'lyra', waiting: READ_LYRA },
    ]);
    let answer: (value: MockAnswer) => void = () => undefined;
    const { api } = render({
      'POST /api/v1/cards/scan-match': [
        () => {
          throw new TypeError('Network request failed');
        },
        ok(FOUND_LYRA),
      ],
      'POST /api/v1/inventory/items/batch': [
        () => new Promise<MockAnswer>((resolve) => (answer = resolve)),
        ok({ ...ADDED, itemsCreated: 1, copiesAdded: 1, createdItemIds: ['item-lyra'] }),
      ],
    });
    await screen.findByRole('header', { name: 'Review 2 cards' });
    await waitFor(() => expect(api.callsTo('POST /api/v1/cards/scan-match')).toHaveLength(1));
    fireEvent.press(addButton());
    await waitFor(() => expect(api.callsTo('POST /api/v1/inventory/items/batch')).toHaveLength(1));
    // The waiting card is matched while the add is on its way: it was not in that add.
    await act(async () => {
      await scanRunner.retryWaiting();
    });
    expect(findTile(useScanStore.getState().session, lyra)?.status).toBe('FOUND');
    await act(async () => {
      answer(ok({ ...ADDED, itemsCreated: 1, copiesAdded: 1, createdItemIds: ['item-yew'] }));
    });
    // The scan goes on with it: only the card added left, with its photo.
    expect(await screen.findByText('Saved · 1 card')).toBeOnTheScreen();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(screen.queryByTestId(`review-row-${yew}`)).toBeNull();
    expect(screen.getByTestId(`review-row-${lyra}`)).toBeOnTheScreen();
    expect(mockFiles.deleted).toEqual([libraryPhoto('yew-1').uri]);
    expect(addButton()).toHaveTextContent(/Add 1 card to inventory/);

    fireEvent.press(addButton());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/inventory'));
    const calls = api.callsTo('POST /api/v1/inventory/items/batch');
    expect(calls[1]?.body).toEqual({
      visibility: 'PRIVATE',
      lines: [{ printingId: FOUND_LYRA.printing?.id, quantity: 1 }],
    });
    expect(calls[1]?.headers.get('Idempotency-Key')).not.toBe(
      calls[0]?.headers.get('Idempotency-Key')
    );
  });

  it('sent again and refused for the limit: nothing was added, the cards can change and go under a new key', async () => {
    countUuids();
    const ids = seedMockupScan();
    const { api } = render({
      'POST /api/v1/inventory/items/batch': [
        () => {
          throw new TypeError('Network request failed');
        },
        problem(429, 'LIMIT_REACHED', 'You have reached the limit for this action', {
          limitKey: 'inventory.items.max',
          limit: 500,
          used: 499,
          requested: 2,
        }),
        ok(ADDED),
      ],
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(addButton());
    await screen.findByTestId('review-add-error');
    fireEvent.press(addButton());
    await screen.findByTestId('review-limit');
    // The limit is decided after the key: the first try did not go through either.
    expect(screen.queryByText('Not confirmed yet')).toBeNull();
    expect(screen.getByTestId(`review-row-${ids.lyra}-more`)).toBeEnabled();
    expect(screen.getByLabelText('Private: only you see them. Change')).toBeEnabled();
    fireEvent.press(screen.getByTestId(`review-row-${ids.lyra}-remove`));
    fireEvent.press(addButton());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/inventory'));
    const calls = api.callsTo('POST /api/v1/inventory/items/batch');
    const keys = calls.map((call) => call.headers.get('Idempotency-Key'));
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(calls[2]?.body).toEqual({
      visibility: 'PRIVATE',
      lines: [{ printingId: FOUND_YEW.printing?.id, quantity: 2 }],
    });
  });

  it('sent again and refused before the key (adding off): still cannot tell, what was sent stays', async () => {
    countUuids();
    const ids = seedMockupScan();
    const { api } = render({
      'POST /api/v1/inventory/items/batch': [
        () => {
          throw new TypeError('Network request failed');
        },
        problem(404, 'FEATURE_DISABLED', 'Feature is disabled', { feature: 'cardTextScan' }),
        ok(ADDED),
      ],
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(addButton());
    await screen.findByTestId('review-add-error');
    fireEvent.press(addButton());
    await waitFor(() => expect(api.callsTo('POST /api/v1/inventory/items/batch')).toHaveLength(2));
    await waitFor(() => expect(addButton()).toBeEnabled());
    // The first try may have gone through: the cards stay as they were sent.
    expect(screen.getByTestId('review-add-error')).toHaveTextContent(
      /we can't tell whether your cards were added/
    );
    expect(screen.getByTestId(`review-row-${ids.yew}-not-confirmed`)).toBeOnTheScreen();
    fireEvent.press(addButton());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/inventory'));
    const keys = api
      .callsTo('POST /api/v1/inventory/items/batch')
      .map((call) => call.headers.get('Idempotency-Key'));
    expect(new Set(keys).size).toBe(1);
  });

  it('keeps the failure in view at the largest text size: above the button, its words capped, all of it spoken', async () => {
    const WINDOW = Dimensions.get('window');
    act(() => {
      Dimensions.set({
        window: { ...WINDOW, fontScale: 3.1 },
        screen: { ...WINDOW, fontScale: 3.1 },
      });
    });
    try {
      seedMockupScan();
      render({
        'POST /api/v1/inventory/items/batch': () => {
          throw new TypeError('Network request failed');
        },
      });
      await screen.findByRole('header', { name: 'Review 6 cards' });
      fireEvent.press(addButton());
      const footer = screen.getByTestId('screen-scan-review-footer');
      const notice = await within(footer).findByTestId('review-add-error');
      const message = within(notice).getByTestId('review-add-error-message');
      // Its first words are in the bar that stays on screen, right above the button.
      expect(message).toHaveTextContent(/^We couldn't hear back from OrenjiTrade/);
      expect(message.props.maxFontSizeMultiplier).toBe(PINNED_MAX_FONT_SCALE);
      expect(notice.props.accessibilityLabel).toBe(REVIEW_COPY.unsure);
      // Not in the list that scrolls.
      expect(
        within(screen.getByTestId('screen-scan-review-scroll')).queryByTestId('review-add-error')
      ).toBeNull();
    } finally {
      act(() => {
        Dimensions.set({ window: WINDOW, screen: WINDOW });
      });
    }
  });

  it('adds a new scan with a new key', async () => {
    countUuids();
    seedMockupScan();
    const { api } = render({
      'POST /api/v1/inventory/items/batch': [
        () => {
          throw new TypeError('Network request failed');
        },
        ok(ADDED),
      ],
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(addButton());
    await screen.findByTestId('review-add-error');
    act(() => {
      scanRunner.endScan();
      seedMockupScan();
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(addButton());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/inventory'));
    const [first, second] = api
      .callsTo('POST /api/v1/inventory/items/batch')
      .map((call) => call.headers.get('Idempotency-Key'));
    expect(first).toMatch(/^scan-[0-9a-f-]{36}$/);
    expect(second).toMatch(/^scan-[0-9a-f-]{36}$/);
    expect(second).not.toBe(first);
  });
});

describe('leaving the review', () => {
  it('goes back to the camera under it', async () => {
    seedMockupScan();
    render();
    await screen.findByRole('header', { name: 'Review 6 cards' });
    expect(mockLeave.held).toBe(false);
    fireEvent.press(screen.getByLabelText('Back to scanning'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(useScanStore.getState().session.tiles).toHaveLength(5);
  });

  it('opened from the photos, opens the camera in its place, and asks before leaving the cards', async () => {
    mockParams.current = { from: 'photos' };
    seedMockupScan();
    render();
    await screen.findByRole('header', { name: 'Review 6 cards' });
    expect(mockLeave.held).toBe(true);

    // The back gesture asks first; Keep scanning stays.
    act(() => mockLeave.tryToLeave());
    expect(await screen.findByTestId('scan-leave-sheet')).toHaveTextContent(
      /Leave without adding\?The 6 cards in this scan won't be added to your inventory\./
    );
    fireEvent.press(screen.getByTestId('scan-leave-stay'));
    await waitFor(() => expect(screen.queryByTestId('scan-leave-sheet')).toBeNull());

    // Leave ends the scan (its photos are deleted) and carries out the gesture.
    act(() => mockLeave.tryToLeave());
    fireEvent.press(await screen.findByTestId('scan-leave-confirm'));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' }));
    expect(mockFiles.deleted).toHaveLength(6);
    expect(useScanStore.getState().session.tiles).toEqual([]);
  });

  it('with an add not confirmed, asks counting only the cards not added, and says to check Inventory', async () => {
    mockParams.current = { from: 'photos' };
    seedMockupScan();
    render({
      'POST /api/v1/inventory/items/batch': () => {
        throw new TypeError('Network request failed');
      },
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(addButton());
    await screen.findByTestId('review-add-error');
    act(() => mockLeave.tryToLeave());
    const sheet = await screen.findByTestId('scan-leave-sheet');
    // Yew ×2 and Lyra were sent: they may be in the inventory already.
    expect(within(sheet).getByTestId('scan-leave-text')).toHaveTextContent(
      "The 3 cards in this scan won't be added to your inventory."
    );
    expect(within(sheet).getByTestId('scan-leave-unconfirmed')).toHaveTextContent(
      "We couldn't tell whether the 3 cards you added went through: check Inventory."
    );
    fireEvent.press(screen.getByTestId('scan-leave-stay'));
    await waitFor(() => expect(screen.queryByTestId('scan-leave-sheet')).toBeNull());

    // Only the cards sent are left: nothing is said to be left out.
    act(() => {
      for (const tile of useScanStore.getState().session.tiles) {
        scanRunner.removeTile(tile.id);
      }
    });
    expect(screen.getByTestId('review-summary')).toHaveTextContent('3 ready');
    // Only the photos of the cards not sent were deleted: the ones sent stay with their cards.
    await waitFor(() => expect(mockFiles.deleted).toHaveLength(3));
    expect(mockFiles.deleted.sort()).toEqual(
      ['lantern', 'fox', 'blur'].map((name) => libraryPhoto(name).uri).sort()
    );
    act(() => mockLeave.tryToLeave());
    const only = await screen.findByTestId('scan-leave-sheet');
    expect(within(only).queryByTestId('scan-leave-text')).toBeNull();
    expect(within(only).getByTestId('scan-leave-unconfirmed')).toHaveTextContent(
      "We couldn't tell whether the 3 cards you added went through: check Inventory."
    );
  });

  it('opened from the photos, every row removed then back: the scan ends and its photos are deleted', async () => {
    mockParams.current = { from: 'photos' };
    const [first = '', second = ''] = seedScan([
      { photo: 'yew-1', match: FOUND_YEW },
      { photo: 'blur', unread: READ_BLUR },
    ]);
    const view = render();
    await screen.findByRole('header', { name: 'Review 2 cards' });
    fireEvent.press(screen.getByTestId(`review-row-${first}-remove`));
    fireEvent.press(screen.getByTestId(`review-row-${second}-remove`));
    await waitFor(() =>
      expect(mockFiles.deleted.sort()).toEqual(
        [libraryPhoto('yew-1').uri, libraryPhoto('blur').uri].sort()
      )
    );
    // Nothing is left to lose: the back gesture leaves without asking.
    expect(mockLeave.held).toBe(false);
    const scan = scanRunner.currentScan();
    view.unmount();
    expect(scanRunner.currentScan()).not.toBe(scan);
    expect(useScanStore.getState().session.discarded).toEqual([]);
  });

  it('left with nothing in the scan, ends it: photos still waiting to be deleted go too', async () => {
    mockParams.current = { from: 'photos' };
    const [only = ''] = seedScan([{ photo: 'yew-1', match: FOUND_YEW }]);
    // Removed while no screen deleted its file yet.
    act(() => {
      useScanStore.getState().apply((session) => removeTile(session, only));
    });
    const view = render();
    await screen.findByRole('header', { name: 'Review 0 cards' });
    expect(mockFiles.deleted).toEqual([]);
    view.unmount();
    expect(mockFiles.deleted).toEqual([libraryPhoto('yew-1').uri]);
  });

  it('opened from the photos, "Back to scanning" opens the camera', async () => {
    mockParams.current = { from: 'photos' };
    seedMockupScan();
    render();
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(screen.getByLabelText('Back to scanning'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/scan'));
    expect(mockLeave.held).toBe(false);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(useScanStore.getState().session.tiles).toHaveLength(5);
  });
});

describe('while photos are read', () => {
  it('says "Reading n of m…", shows placeholders, and waits to add', async () => {
    const [found] = seedScan([
      { photo: 'yew-1', match: FOUND_YEW },
      { photo: 'two', reading: true },
      { photo: 'three', reading: true },
    ]);
    render();
    expect(await screen.findByTestId('review-summary')).toHaveTextContent('Reading 2 of 3…');
    expect(screen.getByTestId('review-reading')).toBeOnTheScreen();
    expect(addButton()).toBeDisabled();
    // The button says why it waits, and the title counts the photos being read too.
    expect(addButton()).toHaveTextContent(/Wait until every photo is read/);
    expect(screen.getByRole('header', { name: 'Review 3 cards' })).toBeOnTheScreen();
    expect(findTile(useScanStore.getState().session, found ?? '')?.status).toBe('FOUND');
  });
});
