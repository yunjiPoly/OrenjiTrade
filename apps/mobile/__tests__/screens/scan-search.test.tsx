import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import ScanSearchRoute from '@/app/scan/search';
import { scanRunner } from '@/src/features/scan/scanRunner';
import { findTile } from '@/src/features/scan/scanSession';
import { useScanStore } from '@/src/features/scan/scanStore';
import type { ScanRead } from '@/src/features/scan/types';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { mockApi, ok, type MockRoutes } from '../support/mockApi';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { FOUND_YEW, YEW } from '../support/scanFixtures';
import { resetScanMocks, scanRoutes } from '../support/scanScreen';
import { READ_BLUR, seedScan } from '../support/scanSeed';
import { renderWithProviders, resetAppState } from '../test-utils';

/**
 * Search by name or code inside the scan (owner spec 2026-10-15, section 4): R2's typing search,
 * opened with what was read; an exact printing fixes the tile, a card opens the printing list (and
 * the rarity list next), and every pick goes back to where the search was opened. Fictional cards.
 */

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: () => undefined }));
jest.mock('@/src/features/scan/ocr/deviceOcr', () =>
  require('../support/scanScreen').deviceOcrMock()
);
jest.mock('expo-file-system', () => require('../support/scanScreen').fileSystemMock());
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const WYVERN = { id: 'card-wyvern', name: 'Smudged Wyvern' };

const SUGGESTIONS = [
  {
    kind: 'CARD',
    id: WYVERN.id,
    name: WYVERN.name,
    game: 'yugioh',
    printingCount: 3,
    imageUrl: '/api/v1/public/card-images/img-wyvern',
  },
  {
    kind: 'PRINTING',
    id: WYVERN.id,
    printingId: 'p-zwyv-001',
    name: WYVERN.name,
    game: 'yugioh',
    printingCode: 'ZWYV-EN001',
    setCode: 'ZWYV',
    setName: 'Wyvern Wings',
    rarity: 'Ultra Rare',
    imageUrl: '/api/v1/public/card-images/img-wyvern-zwyv',
  },
];

const WYVERN_DETAIL = {
  id: WYVERN.id,
  game: 'yugioh',
  name: WYVERN.name,
  printings: [
    {
      id: 'p-zrar-010-s',
      setCode: 'ZRAR',
      setName: 'Wyvern Rarity',
      printingCode: 'ZRAR-EN010',
      rarity: 'Super Rare',
      language: 'EN',
      setReleaseDate: '2023-01-01',
    },
    {
      id: 'p-zrar-010-u',
      setCode: 'ZRAR',
      setName: 'Wyvern Rarity',
      printingCode: 'ZRAR-EN010',
      rarity: 'Ultra Rare',
      language: 'EN',
      setReleaseDate: '2023-01-01',
    },
    {
      id: 'p-zwyv-001',
      setCode: 'ZWYV',
      setName: 'Wyvern Wings',
      printingCode: 'ZWYV-EN001',
      rarity: 'Ultra Rare',
      language: 'EN',
      setReleaseDate: '2024-03-01',
    },
  ],
};

function render(routes: MockRoutes = {}) {
  const api = mockApi(
    scanRoutes({
      'GET /api/v1/cards/suggest': ok(SUGGESTIONS),
      'GET /api/v1/cards/{id}/printings': ok(WYVERN_DETAIL.printings),
      ...routes,
    })
  );
  const view = renderWithProviders(<ScanSearchRoute />, {
    port: new FakeAuthPort(testUser()),
    scheme: 'dark',
  });
  return { api, ...view };
}

/** One photo that could not be read, and the search opened for it. */
function openForUnread(read: ScanRead | null = READ_BLUR) {
  const [tileId = ''] = seedScan([{ photo: 'blur', unread: read }]);
  mockParams.current = { tileId };
  return tileId;
}

const tileOf = (tileId: string) => findTile(useScanStore.getState().session, tileId);

let announce: jest.SpyInstance;

beforeEach(() => {
  resetAppState();
  resetRouterMock();
  resetScanMocks();
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(async () => {
  await scanRunner.idle();
  scanRunner.endScan();
  announce.mockRestore();
});

describe('the search inside the scan', () => {
  it('opens with the name read, and shows cards and exact printings', async () => {
    openForUnread();
    const { api } = render();
    expect(screen.getByTestId('add-search-input').props.value).toBe('Smudged Wyvern');
    const results = await screen.findByTestId('add-search-results');
    expect(results).toHaveTextContent(/CARDS.*Smudged Wyvern.*Yu-Gi-Oh!.*3 printings/);
    expect(results).toHaveTextContent(/EXACT PRINTINGS.*ZWYV-EN001.*Wyvern Wings.*Ultra Rare/);
    const asked = api.callsTo('GET /api/v1/cards/suggest')[0]?.query;
    expect(asked?.get('q')).toBe('Smudged Wyvern');
    // The scan reads Yu-Gi-Oh! cards only: the suggestions are that game's.
    expect(asked?.get('game')).toBe('yugioh');
    // Its own hint: inside the scan, an exact printing fixes the photo's card.
    expect(screen.getByTestId('add-search-hint')).toHaveTextContent(
      'Tap a card to pick its printing, or an exact printing to use it for this photo.'
    );
  });

  it('never takes a card of another game for the photo', async () => {
    const tileId = openForUnread();
    render({
      'GET /api/v1/cards/suggest': ok([
        { ...SUGGESTIONS[0], id: 'card-drake', name: 'Cinder Drake', game: 'mtg' },
        {
          ...SUGGESTIONS[1],
          id: 'card-drake',
          printingId: 'p-drake',
          name: 'Cinder Drake',
          game: 'mtg',
          printingCode: 'ZTDX-076',
        },
      ]),
    });
    fireEvent.press(await screen.findByTestId('add-card-card-drake'));
    fireEvent.press(screen.getByTestId('add-printing-ZTDX-076'));
    expect(screen.queryByTestId('scan-printing-sheet')).toBeNull();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(tileOf(tileId)?.status).toBe('NOT_FOUND');
    expect(tileOf(tileId)?.card).toBeNull();
  });

  it('opens with the code when no name was read, and empty when nothing was', async () => {
    openForUnread({ codes: ['ZQQ-EN999'], names: [] });
    const first = render();
    expect(screen.getByTestId('add-search-input').props.value).toBe('ZQQ-EN999');
    first.unmount();
    scanRunner.endScan();

    openForUnread(null);
    render();
    expect(screen.getByTestId('add-search-input').props.value).toBe('');
  });

  it('an exact printing fixes the tile and goes back', async () => {
    const tileId = openForUnread();
    render();
    fireEvent.press(await screen.findByTestId('add-printing-ZWYV-EN001'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    const tile = tileOf(tileId);
    expect(tile?.status).toBe('FOUND');
    expect(tile?.card).toEqual({
      id: WYVERN.id,
      name: WYVERN.name,
      imageUrl: '/api/v1/public/card-images/img-wyvern-zwyv',
    });
    expect(tile?.printing).toEqual({
      id: 'p-zwyv-001',
      printingCode: 'ZWYV-EN001',
      setCode: 'ZWYV',
      setName: 'Wyvern Wings',
      rarity: 'Ultra Rare',
    });
    expect(announce).toHaveBeenCalledWith('Smudged Wyvern, found');
  });

  it('a card opens the printing list; a code in one rarity fixes the tile', async () => {
    const tileId = openForUnread();
    render();
    fireEvent.press(await screen.findByTestId(`add-card-${WYVERN.id}`));
    const sheet = await screen.findByTestId('scan-printing-sheet');
    expect(sheet).toHaveTextContent(/Pick the printing.*Smudged Wyvern\./);
    // The catalog's English printings, newest set first, one row per code.
    expect(await within(sheet).findByTestId('scan-printing-count')).toHaveTextContent(
      '3 PRINTINGS, NEWEST FIRST'
    );
    expect(within(sheet).getByTestId('scan-printing-list')).toHaveTextContent(
      /ZWYV-EN001.*Wyvern Wings.*Ultra Rare.*ZRAR-EN010.*Wyvern Rarity.*2 rarities/
    );
    // Until a printing is picked, the tile is as it was.
    expect(tileOf(tileId)?.status).toBe('NOT_FOUND');
    fireEvent.press(within(sheet).getByTestId('scan-printing-row-ZWYV-EN001'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(tileOf(tileId)?.status).toBe('FOUND');
    expect(tileOf(tileId)?.printing?.id).toBe('p-zwyv-001');
    expect(tileOf(tileId)?.printings.map((printing) => printing.id)).toEqual([
      'p-zwyv-001',
      'p-zrar-010-s',
      'p-zrar-010-u',
    ]);
  });

  it('a code in several rarities opens the rarity list next', async () => {
    const tileId = openForUnread();
    render();
    fireEvent.press(await screen.findByTestId(`add-card-${WYVERN.id}`));
    const sheet = await screen.findByTestId('scan-printing-sheet');
    fireEvent.press(await within(sheet).findByTestId('scan-printing-row-ZRAR-EN010'));
    const rarities = await screen.findByTestId('scan-rarity-sheet');
    expect(rarities).toHaveTextContent(
      /Smudged Wyvern · ZRAR-EN010\. This code comes in 2 rarities: pick the one on your card\./
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
    fireEvent.press(within(rarities).getByRole('radio', { name: 'Super Rare' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(tileOf(tileId)?.status).toBe('FOUND');
    expect(tileOf(tileId)?.printing?.id).toBe('p-zrar-010-s');
  });

  it('"Search by name or code" on the rarity list goes back to this search', async () => {
    openForUnread();
    render();
    fireEvent.press(await screen.findByTestId(`add-card-${WYVERN.id}`));
    const sheet = await screen.findByTestId('scan-printing-sheet');
    fireEvent.press(await within(sheet).findByTestId('scan-printing-row-ZRAR-EN010'));
    const rarities = await screen.findByTestId('scan-rarity-sheet');
    fireEvent.press(within(rarities).getByRole('link', { name: 'Search by name or code' }));
    await waitFor(() => expect(screen.queryByTestId('scan-rarity-sheet')).toBeNull());
    expect(screen.getByTestId('add-search-input')).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('Cancel on the printing list changes nothing and stays; Cancel goes back', async () => {
    const tileId = openForUnread();
    render();
    fireEvent.press(await screen.findByTestId(`add-card-${WYVERN.id}`));
    await screen.findByTestId('scan-printing-sheet');
    fireEvent.press(screen.getByTestId('scan-printing-cancel'));
    await waitFor(() => expect(screen.queryByTestId('scan-printing-sheet')).toBeNull());
    expect(tileOf(tileId)?.status).toBe('NOT_FOUND');
    expect(mockRouter.back).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('add-search-cancel'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(tileOf(tileId)?.status).toBe('NOT_FOUND');
  });

  it('replaces a wrong match of a found card (28\'s "Not here? Search")', async () => {
    const [tileId = ''] = seedScan([{ photo: 'yew', match: FOUND_YEW }]);
    mockParams.current = { tileId };
    render();
    expect(screen.getByTestId('add-search-input').props.value).toBe(YEW.name);
    fireEvent.press(await screen.findByTestId('add-printing-ZWYV-EN001'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(tileOf(tileId)?.card?.id).toBe(WYVERN.id);
    expect(tileOf(tileId)?.copies).toBe(1);
  });

  it('says when the card is no longer in the scan', async () => {
    mockParams.current = { tileId: 'scan-99' };
    render();
    expect(screen.getByText('This card is no longer in the scan.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Back to scanning' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
