import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import ScanReviewRoute from '@/app/scan/review';
import { scanRunner } from '@/src/features/scan/scanRunner';
import { resetScanReviewOptions } from '@/src/features/scan/scanReviewOptions';
import { findTile } from '@/src/features/scan/scanSession';
import { useScanStore } from '@/src/features/scan/scanStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { binderFixture } from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { mockDispatch, mockParams, mockRouter, resetRouterMock } from '../support/router';
import { FOUND_YEW, LANTERN, LYRA, YEW } from '../support/scanFixtures';
import { libraryPhoto, mockFiles, resetScanMocks, scanRoutes } from '../support/scanScreen';
import { FOUND_LYRA, READ_BLUR, seedMockupScan, seedScan } from '../support/scanSeed';
import { renderWithProviders, resetAppState } from '../test-utils';

/**
 * Review (mockup screen 30, owner spec 2026-10-15, section 4): "To check" above "Ready", each row's
 * fix, the pills, the warning, "Add {n} cards to inventory" and its refusals. The scan is put in
 * the store directly (fictional cards and photo names); the API is the fake one.
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
  await scanRunner.idle();
  scanRunner.endScan();
  announce.mockRestore();
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
    expect(screen.getByLabelText("Remove Couldn't read")).toBeOnTheScreen();
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

    fireEvent.press(screen.getByLabelText("Remove Couldn't read"));
    expect(screen.queryByTestId(`review-row-${ids.blur}`)).toBeNull();
    expect(screen.getByTestId('review-summary')).toHaveTextContent('3 ready · 2 to check');
    expect(screen.getByTestId('review-warning')).toHaveTextContent(
      "The 2 cards to check won't be added."
    );
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
    // Nothing was added: the scan and its photos are kept, the screen stays.
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(useScanStore.getState().session.tiles).toHaveLength(5);
    expect(mockFiles.deleted).toEqual([]);
    expect(addButton()).toBeEnabled();

    fireEvent.press(addButton());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/inventory'));
    expect(api.callsTo('POST /api/v1/inventory/items/batch')).toHaveLength(2);
  });

  it('says what to do when offline, when the binder is gone, and when adding is off', async () => {
    seedMockupScan();
    render({
      'POST /api/v1/inventory/items/batch': [
        () => {
          throw new TypeError('Network request failed');
        },
        problem(404, 'NOT_FOUND', 'Binder not found'),
        problem(404, 'FEATURE_DISABLED', 'Feature is disabled', { feature: 'cardTextScan' }),
      ],
    });
    await screen.findByRole('header', { name: 'Review 6 cards' });
    fireEvent.press(addButton());
    expect(await screen.findByTestId('review-add-error')).toHaveTextContent(
      /We could not reach OrenjiTrade\. Nothing was added and your cards are still here: check your connection and add again\./
    );
    expect(useScanStore.getState().session.tiles).toHaveLength(5);

    // A binder deleted meanwhile: back to "No binder".
    fireEvent.press(screen.getByLabelText('Binder: no binder'));
    const sheet = await screen.findByTestId('review-binder-sheet');
    fireEvent.press(await within(sheet).findByRole('radio', { name: 'Trade binder, Private' }));
    await waitFor(() => expect(screen.getByLabelText('Binder: Trade binder')).toBeOnTheScreen());
    fireEvent.press(addButton());
    await waitFor(() =>
      expect(screen.getByTestId('review-add-error')).toHaveTextContent(
        /That binder is gone\. Nothing was added: pick another binder, or No binder, and add again\./
      )
    );
    expect(screen.getByLabelText('Binder: no binder')).toBeOnTheScreen();

    fireEvent.press(addButton());
    await waitFor(() =>
      expect(screen.getByTestId('review-add-error')).toHaveTextContent(
        /Adding scanned cards is turned off for now\. Nothing was added: add them by name or code from Add cards\./
      )
    );
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(mockFiles.deleted).toEqual([]);
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
    expect(findTile(useScanStore.getState().session, found ?? '')?.status).toBe('FOUND');
  });
});
