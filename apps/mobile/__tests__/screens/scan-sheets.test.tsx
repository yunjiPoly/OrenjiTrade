import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { AccessibilityInfo, Keyboard } from 'react-native';

import ScanCameraRoute from '@/app/scan/index';
import { scanRunner } from '@/src/features/scan/scanRunner';
import { useScanStore } from '@/src/features/scan/scanStore';
import { PINNED_MAX_FONT_SCALE, TITLE_MAX_FONT_SCALE } from '@/src/theme';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { mockApi, ok, problem, type MockAnswer, type MockRoutes } from '../support/mockApi';
import { mockRouter, resetRouterMock } from '../support/router';
import { FOUND_YEW, FOX, LANTERN, READ_YEW, YEW } from '../support/scanFixtures';
import {
  libraryPhoto,
  mockFiles,
  PHOTO_TEXT,
  readerOf,
  resetScanMocks,
  scanRoutes,
} from '../support/scanScreen';
import { seedScan } from '../support/scanSeed';
import { renderWithProviders, resetAppState } from '../test-utils';

/**
 * The quick fixes of the tray (owner spec 2026-10-15, section 4): 28 Check the match, the rarity
 * list, the printing list and 29 Couldn't read this card, opened from the tiles of the camera
 * screen. The reader and the API are stand-ins; the cards are fictional.
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
const announced = () =>
  (AccessibilityInfo.announceForAccessibility as jest.Mock).mock.calls.map((call) => call[0]);

const FOUND_LABEL = `${YEW.name}, ZACR-EN036, found`;
const RARITY_LABEL = `${LANTERN.name}, ZRA1-EN075, pick rarity`;
const PRINTING_LABEL = `${FOX.name}, set code unreadable, pick printing`;
const UNREAD_LABEL = "Couldn't read this card, tap to search";

/**
 * The catalog's printings of the fictional fox (`GET /cards/{id}/printings`), for a card picked by
 * its name.
 */
const FOX_PRINTINGS = [
  {
    id: 'p-zold-002',
    setCode: 'ZOLD',
    setName: 'Old Paper Pack',
    printingCode: 'ZOLD-EN002',
    rarity: 'Common',
    language: 'EN',
    setReleaseDate: '2009-05-01',
  },
  {
    id: 'p-zpap-001',
    setCode: 'ZPAP',
    setName: 'Paper Pack',
    printingCode: 'ZPAP-EN001',
    rarity: 'Super Rare',
    language: 'EN',
    setReleaseDate: '2024-02-01',
  },
  {
    id: 'p-zpap-fr-001',
    setCode: 'ZPAP',
    setName: 'Paper Pack',
    printingCode: 'ZPAP-FR001',
    rarity: 'Super Rare',
    language: 'FR',
    setReleaseDate: '2024-02-01',
  },
];

/** Opens the camera and adds the four fictional photos: one tile of each status. */
async function scanFour(routes: MockRoutes = {}) {
  readerOf({
    [libraryPhoto('yew').uri]: PHOTO_TEXT.yew,
    [libraryPhoto('lantern').uri]: PHOTO_TEXT.lantern,
    [libraryPhoto('fox').uri]: PHOTO_TEXT.fox,
    [libraryPhoto('blank').uri]: PHOTO_TEXT.blank,
  });
  pickLibrary.mockResolvedValueOnce({
    canceled: false,
    assets: ['yew', 'lantern', 'fox', 'blank'].map((name) => libraryPhoto(name)),
  });
  const api = mockApi(scanRoutes(routes));
  renderWithProviders(<ScanCameraRoute />, { port: new FakeAuthPort(testUser()), scheme: 'dark' });
  await screen.findByTestId('screen-scan-camera');
  fireEvent.press(screen.getByLabelText('Add photos you already took'));
  await waitFor(() => expect(screen.getByText('THIS SCAN · 4')).toBeTruthy());
  return api;
}

function tile(label: string) {
  return screen.getByLabelText(label);
}

async function sheetGone(testID: string) {
  await waitFor(() => expect(screen.queryByTestId(testID)).toBeNull());
}

/**
 * The removed tile's photo is deleted once its sheet has left, while the scan goes on (not only
 * when the scan ends): the other three photos stay.
 */
async function photoDeletedDuringTheScan(name: string) {
  await waitFor(() => expect(mockFiles.deleted).toEqual([libraryPhoto(name).uri]));
  expect(useScanStore.getState().session.tiles).toHaveLength(3);
  expect(useScanStore.getState().session.discarded).toEqual([]);
}

beforeEach(() => {
  resetAppState();
  resetRouterMock();
  resetScanMocks();
  pickLibrary.mockReset();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(async () => {
  await scanRunner.idle();
  scanRunner.endScan();
  jest.restoreAllMocks();
});

describe('28 Check the match', () => {
  it('shows the photo next to the match, what was read, and the copies', async () => {
    await scanFour();
    fireEvent.press(tile(FOUND_LABEL));
    const sheet = await screen.findByTestId('scan-check-sheet');
    expect(within(sheet).getByRole('header', { name: 'Check the match' })).toBeTruthy();
    expect(within(sheet).getByText('Your photo')).toBeTruthy();
    expect(within(sheet).getByText('Our match')).toBeTruthy();
    expect(within(sheet).getByLabelText(YEW.name)).toBeTruthy();
    expect(within(sheet).getByTestId('scan-check-name')).toHaveTextContent(YEW.name);
    expect(within(sheet).getByText('ZACR-EN036 · Lantern Crisis')).toBeTruthy();
    expect(within(sheet).getByTestId('scan-check-rarity')).toHaveTextContent('Secret Rare');
    expect(
      within(sheet).getByLabelText(`Read from your photo: ZACR-EN036 · ${YEW.name}`)
    ).toBeTruthy();
    expect(within(sheet).getByText('OTHER MATCHES')).toBeTruthy();

    expect(within(sheet).getByLabelText('One less')).toBeDisabled();
    fireEvent.press(within(sheet).getByLabelText('One more'));
    expect(within(sheet).getByLabelText('Copies: 2')).toBeTruthy();
    expect(screen.getByText('×2')).toBeTruthy();
    expect(screen.getByText('THIS SCAN · 5')).toBeTruthy();

    fireEvent.press(within(sheet).getByLabelText('Done'));
    await sheetGone('scan-check-sheet');
    expect(tile(`${FOUND_LABEL}, 2 copies`)).toBeTruthy();
  });

  it('replaces the match from "Other matches": a code in several rarities asks for one first', async () => {
    await scanFour();
    fireEvent.press(tile(FOUND_LABEL));
    const sheet = await screen.findByTestId('scan-check-sheet');
    const current = within(sheet).getByLabelText(`${YEW.name}, ZACR-EN036, Secret Rare`);
    expect(current).toBeChecked();

    fireEvent.press(within(sheet).getByLabelText(`${YEW.name}, ZRA4-EN025, 2 rarities`));
    expect(within(sheet).getByText('This code comes in 2 rarities. Pick yours.')).toBeTruthy();
    const done = within(sheet).getByTestId('scan-check-done');
    expect(done).toBeDisabled();
    expect(within(sheet).getByLabelText('Pick a rarity')).toBeTruthy();
    expect(tile(`${YEW.name}, ZRA4-EN025, pick rarity`)).toBeTruthy();

    // Each change of the match is said by the screen reader, as the search's are.
    expect(announced()).toContain(`${YEW.name}, pick rarity`);

    fireEvent.press(within(sheet).getByRole('radio', { name: 'Ultra Rare' }));
    expect(within(sheet).getByLabelText('Done')).toBeEnabled();
    expect(within(sheet).getByText('ZRA4-EN025 · Stampede of Lanterns')).toBeTruthy();
    expect(tile(`${YEW.name}, ZRA4-EN025, found`)).toBeTruthy();
    expect(announced()).toContain(`${YEW.name}, found`);

    // A code one look-alike away that belongs to another card.
    fireEvent.press(within(sheet).getByLabelText('Fable Tide - Lyra, ZACR-EN038, Super Rare'));
    expect(within(sheet).getByTestId('scan-check-name')).toHaveTextContent('Fable Tide - Lyra');
    expect(tile('Fable Tide - Lyra, ZACR-EN038, found')).toBeTruthy();
    expect(announced()).toContain('Fable Tide - Lyra, found');
  });

  it('a card with a close name opens the printing list, read from the catalog', async () => {
    const api = await scanFour({
      'GET /api/v1/cards/{id}/printings': [
        problem(500, 'INTERNAL_ERROR', 'Something went wrong'),
        ok(FOX_PRINTINGS),
      ],
    });
    fireEvent.press(tile(FOUND_LABEL));
    const sheet = await screen.findByTestId('scan-check-sheet');
    fireEvent.press(within(sheet).getByLabelText(FOX.name));
    const list = await screen.findByTestId('scan-printing-sheet');
    // The catalog failed once: "Try again".
    expect(await within(list).findByText("We couldn't load this card's printings.")).toBeTruthy();
    fireEvent.press(within(list).getByText('Try again'));
    // English printings only, newest set first.
    expect(await within(list).findByText('2 PRINTINGS, NEWEST FIRST')).toBeTruthy();
    const codes = within(list)
      .getAllByTestId(/^scan-printing-row-/)
      .map((row) => row.props.testID as string);
    expect(codes).toEqual(['scan-printing-row-ZPAP-EN001', 'scan-printing-row-ZOLD-EN002']);
    expect(api.callsTo('GET /api/v1/cards/{id}/printings')[0]?.path).toBe(
      '/api/v1/cards/card-fox/printings'
    );
    // Not the card's page: fixing a scanned card records no "card viewed" event.
    expect(api.callsTo('GET /api/v1/cards/{id}')).toEqual([]);

    fireEvent.press(within(list).getByTestId('scan-printing-row-ZOLD-EN002'));
    await sheetGone('scan-printing-sheet');
    expect(tile(`${FOX.name}, ZOLD-EN002, found`)).toBeTruthy();
    expect(announced()).toContain(`${FOX.name}, found`);
  });

  it('"Not here? Search" opens the search inside the scan; "Remove" takes the card out', async () => {
    await scanFour();
    fireEvent.press(tile(FOUND_LABEL));
    let sheet = await screen.findByTestId('scan-check-sheet');
    fireEvent.press(within(sheet).getByLabelText('Not here? Search'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/scan/search',
      params: { tileId: 'scan-1' },
    });
    await sheetGone('scan-check-sheet');

    fireEvent.press(tile(FOUND_LABEL));
    sheet = await screen.findByTestId('scan-check-sheet');
    fireEvent.press(within(sheet).getByLabelText('Remove'));
    await sheetGone('scan-check-sheet');
    expect(screen.queryByLabelText(FOUND_LABEL)).toBeNull();
    expect(screen.getByText('THIS SCAN · 3')).toBeTruthy();
    await photoDeletedDuringTheScan('yew');
  });
});

describe('the rarity list', () => {
  it('lists the rarities of the code; Cancel changes nothing, a pick finds the card', async () => {
    await scanFour();
    fireEvent.press(tile(RARITY_LABEL));
    let sheet = await screen.findByTestId('scan-rarity-sheet');
    expect(within(sheet).getByRole('header', { name: 'Pick the rarity' })).toBeTruthy();
    expect(
      within(sheet).getByText(
        `${LANTERN.name} · ZRA1-EN075. This code comes in 3 rarities: pick the one on your card.`
      ).props.maxFontSizeMultiplier
    ).toBe(TITLE_MAX_FONT_SCALE);
    expect(
      within(sheet)
        .getAllByRole('radio')
        .map((row) => row.props.accessibilityLabel)
    ).toEqual(['Super Rare', 'Ultra Rare', 'Secret Rare']);
    fireEvent.press(within(sheet).getByLabelText('Cancel'));
    await sheetGone('scan-rarity-sheet');
    expect(tile(RARITY_LABEL)).toBeTruthy();

    fireEvent.press(tile(RARITY_LABEL));
    sheet = await screen.findByTestId('scan-rarity-sheet');
    fireEvent.press(within(sheet).getByRole('radio', { name: 'Ultra Rare' }));
    await sheetGone('scan-rarity-sheet');
    expect(tile(`${LANTERN.name}, ZRA1-EN075, found`)).toBeTruthy();
    // The fix is said by the screen reader.
    expect(announced()).toContain(`${LANTERN.name}, found`);
  });

  it('keeps the search one tap away: the card itself may be the wrong one', async () => {
    await scanFour();
    fireEvent.press(tile(RARITY_LABEL));
    const sheet = await screen.findByTestId('scan-rarity-sheet');
    const link = within(sheet).getByRole('link', { name: 'Search by name or code' });
    fireEvent.press(link);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/scan/search',
      params: { tileId: 'scan-2' },
    });
    await sheetGone('scan-rarity-sheet');
    expect(tile(RARITY_LABEL)).toBeTruthy();
  });
});

describe('the printing list', () => {
  it('lists the printings by code, filters by the code typed, and says when none has it', async () => {
    await scanFour();
    fireEvent.press(tile(PRINTING_LABEL));
    const sheet = await screen.findByTestId('scan-printing-sheet');
    expect(within(sheet).getByRole('header', { name: 'Pick the printing' })).toBeTruthy();
    const text = within(sheet).getByText(
      `${FOX.name}. We couldn’t read its set code: type it from your card, or pick it below.`
    );
    // At the largest text sizes the field, the rows, the link and Cancel keep their room: the
    // text grows like a title at most, the buttons at the bottom like a footer.
    expect(text.props.maxFontSizeMultiplier).toBe(TITLE_MAX_FONT_SCALE);
    expect(within(sheet).getByText('Cancel').props.maxFontSizeMultiplier).toBe(
      PINNED_MAX_FONT_SCALE
    );
    expect(within(sheet).getByText('Search by name or code').props.maxFontSizeMultiplier).toBe(
      PINNED_MAX_FONT_SCALE
    );
    // Counted in printings, like the search: ZRA5-EN091 comes in 2 rarities.
    expect(within(sheet).getByText('4 PRINTINGS, NEWEST FIRST')).toBeTruthy();
    expect(within(sheet).getByLabelText('ZDUP-EN077, Paper Power, Ultra Rare')).toBeTruthy();
    expect(within(sheet).getByLabelText('ZRA5-EN091, Paper Rarity 5, 2 rarities')).toBeTruthy();
    expect(within(sheet).getByLabelText('ZLOB-EN005, Legend of Paper Foxes, Common')).toBeTruthy();

    const field = within(sheet).getByLabelText('Set code on your card');
    expect(field.props.placeholder).toBe('Code on your card, like MACR');
    // The search is one tap away while rows are listed too.
    expect(within(sheet).getByTestId('scan-printing-search-link')).toHaveTextContent(
      'Search by name or code'
    );
    fireEvent.changeText(field, 'zra5');
    expect(within(sheet).getByText('2 OF 4 PRINTINGS')).toBeTruthy();
    fireEvent.changeText(field, 'QQ');
    expect(within(sheet).getByText('0 OF 4 PRINTINGS')).toBeTruthy();
    expect(
      within(sheet).getByText(/No printing of this card has that code. Check it, or/)
    ).toBeTruthy();
    // The mockup's sentence holds the link, and the whole sentence is its target (44 points).
    const sentence = within(sheet).getByRole('link', {
      name: 'No printing of this card has that code. Check it, or search by name or code.',
    });
    expect(sentence).toHaveStyle({ minHeight: 44 });
    expect(within(sheet).queryByTestId('scan-printing-search-link')).toBeNull();
    fireEvent.press(within(sheet).getByText('search by name or code'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/scan/search',
      params: { tileId: 'scan-3' },
    });
    await sheetGone('scan-printing-sheet');
  });

  it('gives the rows the room under the field while a code is typed (the largest text sizes)', async () => {
    // The iOS keyboard, as the sheet hears it.
    const listeners = new Map<
      string,
      ((event: { endCoordinates: { height: number } }) => void)[]
    >();
    const real = Keyboard.addListener.bind(Keyboard);
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((
      name: string,
      listener: (event: { endCoordinates: { height: number } }) => void
    ) => {
      if (name !== 'keyboardWillShow' && name !== 'keyboardWillHide') {
        return real(name as never, listener as never);
      }
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
      return { remove: () => undefined };
    }) as never);
    const keyboard = (name: string, height: number) =>
      act(() =>
        listeners.get(name)?.forEach((listener) => listener({ endCoordinates: { height } }))
      );

    await scanFour();
    fireEvent.press(tile(PRINTING_LABEL));
    const sheet = await screen.findByTestId('scan-printing-sheet');
    const field = within(sheet).getByLabelText('Set code on your card');
    // The placeholder fits the field at the largest sizes: the field grows to the pinned scale.
    expect(field.props.maxFontSizeMultiplier).toBe(PINNED_MAX_FONT_SCALE);
    expect(within(sheet).getByTestId('scan-printing-text')).toBeTruthy();
    expect(
      within(within(sheet).getByTestId('scan-printing-list')).queryByTestId('scan-printing-cancel')
    ).toBeNull();

    keyboard('keyboardWillShow', 336);
    fireEvent.changeText(field, 'zdup');
    // The sentence steps aside; the link and Cancel follow the row in the list, which scrolls:
    // under the field there is room for a row, and nothing is left under the keyboard.
    expect(within(sheet).queryByTestId('scan-printing-text')).toBeNull();
    const list = within(sheet).getByTestId('scan-printing-list');
    expect(within(list).getByLabelText('ZDUP-EN077, Paper Power, Ultra Rare')).toBeTruthy();
    expect(within(list).getByTestId('scan-printing-search-link')).toBeTruthy();
    expect(within(list).getByTestId('scan-printing-cancel')).toBeTruthy();
    expect(within(sheet).getAllByTestId('scan-printing-cancel')).toHaveLength(1);

    // The keyboard goes: the sheet as before.
    keyboard('keyboardWillHide', 0);
    expect(within(sheet).getByTestId('scan-printing-text')).toBeTruthy();
    expect(
      within(within(sheet).getByTestId('scan-printing-list')).queryByTestId('scan-printing-cancel')
    ).toBeNull();
    fireEvent.press(within(sheet).getByTestId('scan-printing-cancel'));
    await sheetGone('scan-printing-sheet');
  });

  it('a code in one rarity finds the card; a code in several opens the rarity list next', async () => {
    await scanFour();
    fireEvent.press(tile(PRINTING_LABEL));
    let sheet = await screen.findByTestId('scan-printing-sheet');
    fireEvent.press(within(sheet).getByLabelText('ZRA5-EN091, Paper Rarity 5, 2 rarities'));
    const rarities = await screen.findByTestId('scan-rarity-sheet');
    expect(
      within(rarities).getByText(
        `${FOX.name} · ZRA5-EN091. This code comes in 2 rarities: pick the one on your card.`
      )
    ).toBeTruthy();
    fireEvent.press(within(rarities).getByRole('radio', { name: 'Starlight Rare' }));
    await sheetGone('scan-rarity-sheet');
    expect(tile(`${FOX.name}, ZRA5-EN091, found`)).toBeTruthy();
  });
});

describe("29 Couldn't read this card", () => {
  it('offers the search and three tips; "Take it again" removes the tile', async () => {
    await scanFour();
    fireEvent.press(tile(UNREAD_LABEL));
    let sheet = await screen.findByTestId('scan-unread-sheet');
    expect(within(sheet).getByRole('header', { name: "Couldn't read this card" })).toBeTruthy();
    expect(within(sheet).getByText('Your photo')).toBeTruthy();
    expect(within(sheet).getByText('No match yet')).toBeTruthy();
    expect(
      within(sheet).getByText(
        "We couldn't read the name or the set code. Search for the card, or take the photo again."
      )
    ).toBeTruthy();
    // Each tip is one element for the screen reader (its icon is decorative).
    for (const tip of ['Fill the frame', 'No glare', 'Hold still']) {
      expect(within(sheet).getByLabelText(tip)).toHaveTextContent(tip, { exact: false });
    }
    fireEvent.press(within(sheet).getByLabelText('Search by name or code'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/scan/search',
      params: { tileId: 'scan-4' },
    });
    await sheetGone('scan-unread-sheet');

    fireEvent.press(tile(UNREAD_LABEL));
    sheet = await screen.findByTestId('scan-unread-sheet');
    fireEvent.press(within(sheet).getByLabelText('Take it again'));
    await sheetGone('scan-unread-sheet');
    expect(screen.queryByLabelText(UNREAD_LABEL)).toBeNull();
    expect(screen.getByText('THIS SCAN · 3')).toBeTruthy();
    await photoDeletedDuringTheScan('blank');
  });

  it('for a card given up after server errors: "Couldn\'t match", the search, and "Try again"', async () => {
    readerOf({});
    seedScan([{ photo: 'yew', givenUp: READ_YEW }]);
    let answer: (value: MockAnswer) => void = () => undefined;
    const api = mockApi(
      scanRoutes({
        'POST /api/v1/cards/scan-match': [
          () => new Promise<MockAnswer>((resolve) => (answer = resolve)),
          ok(FOUND_YEW),
        ],
      })
    );
    renderWithProviders(<ScanCameraRoute />, {
      port: new FakeAuthPort(testUser()),
      scheme: 'dark',
    });
    await screen.findByTestId('screen-scan-camera');
    const label = "Couldn't match this card, tap to search";
    expect(tile(label)).toHaveTextContent(/Couldn't match/);
    fireEvent.press(tile(label));
    const sheet = await screen.findByTestId('scan-unread-sheet');
    expect(within(sheet).getByRole('header', { name: "Couldn't match this card" })).toBeTruthy();
    expect(within(sheet).getByTestId('scan-unread-text')).toHaveTextContent(
      "We couldn't match this card right now. Search for it by name or code, or try again later."
    );
    // The read was fine: no tips for the photo, no "Take it again".
    expect(within(sheet).queryByLabelText('No glare')).toBeNull();
    expect(within(sheet).queryByLabelText('Take it again')).toBeNull();
    expect(within(sheet).getByLabelText('Search by name or code')).toBeTruthy();

    // "Try again": a server error again leaves it given up, said again.
    fireEvent.press(within(sheet).getByLabelText('Try again'));
    await waitFor(() =>
      expect(within(sheet).getByTestId('scan-unread-retry')).toHaveTextContent('Trying again…')
    );
    expect(within(sheet).getByTestId('scan-unread-retry')).toBeDisabled();
    await act(async () => {
      answer(problem(503, 'SERVICE_UNAVAILABLE', 'Try again later'));
    });
    await waitFor(() =>
      expect(within(sheet).getByTestId('scan-unread-retry')).toHaveTextContent(/Try again$/)
    );
    expect(announced()).toContain("Couldn't match this card");
    expect(screen.getByTestId('scan-unread-sheet')).toBeTruthy();

    // Again: matched, the sheet goes by itself and the result is said.
    fireEvent.press(within(sheet).getByLabelText('Try again'));
    await sheetGone('scan-unread-sheet');
    expect(tile(FOUND_LABEL)).toBeTruthy();
    expect(announced()).toContain(`${YEW.name}, found`);
    expect(api.callsTo('POST /api/v1/cards/scan-match')).toHaveLength(2);
  });

  it('"Remove" takes the card out too', async () => {
    await scanFour();
    fireEvent.press(tile(UNREAD_LABEL));
    const sheet = await screen.findByTestId('scan-unread-sheet');
    fireEvent.press(within(sheet).getByLabelText('Remove'));
    await sheetGone('scan-unread-sheet');
    expect(screen.queryByLabelText(UNREAD_LABEL)).toBeNull();
    await photoDeletedDuringTheScan('blank');
  });
});
