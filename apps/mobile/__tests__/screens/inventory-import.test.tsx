import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ScrollView } from 'react-native';

import ImportScreen from '@/app/items/import';
import { meKeys } from '@/src/api/queryKeys';
import type { ImportRow, InventoryImport } from '@/src/api/types';
import { PINNED_MAX_FONT_SCALE } from '@/src/theme';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { cardDetailFixture, planFixture, summaryFixture } from '../support/fixtures';
import {
  HERON_CARD,
  HERON_FIRST,
  HERON_PRINTINGS,
  IMPORT_ID,
  IMPORT_LIMITS,
  chooseRow,
  deckRows,
  importFixture,
  rowFixture,
  rowPage,
  summaryOf,
  unmatchedRow,
} from '../support/importFixtures';
import {
  mockApi,
  noContent,
  ok,
  problem,
  type MockRequest,
  type MockRoutes,
} from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockDispatch, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

/** What the screen asked of the navigation: whether leaving is held back, and a way to try to leave. */
const mockLeave: { held: boolean; tryToLeave: () => void } = {
  held: false,
  tryToLeave: () => undefined,
};
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (held: boolean, callback: (options: { data: { action: unknown } }) => void) => {
    mockLeave.held = held;
    mockLeave.tryToLeave = () => callback({ data: { action: { type: 'GO_BACK' } } });
  },
}));

const mockWritten: string[] = [];
/** The device files the flow deleted, by uri. */
const mockDeleted: string[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class MockFile {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join('');
    }
    create() {}
    write(content: string) {
      mockWritten.push(content);
    }
    delete() {
      mockDeleted.push(this.uri);
    }
  },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const picker = DocumentPicker as jest.Mocked<typeof DocumentPicker>;
const INVENTORY_TOTALS = meKeys.inventorySummary(testUser().uid);
const IMPORTS = '/api/v1/inventory/imports';
const DECK_TEXT =
  '#main\n910000001\n910000001\n910000002\n#extra\n910000003\n!side\n910000002\n919999999\n';

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockWritten.length = 0;
  mockDeleted.length = 0;
  mockLeave.held = false;
  picker.getDocumentAsync.mockReset();
});

function render() {
  return renderWithProviders(<ImportScreen />, { port: new FakeAuthPort(testUser()) });
}

/** The counts of some rows, as the API computes them (enough of it for a screen test). */
function summarise(rows: ImportRow[]) {
  const matched = rows.filter((row) => row.status !== 'UNMATCHED');
  const kept = matched.filter((row) => row.included && row.inScope);
  const ready = kept.filter((row) => row.status === 'READY');
  return summaryOf({
    rows: rows.length,
    ready: ready.length,
    toChoose: kept.filter((row) => row.status === 'CHOOSE_PRINTING').length,
    unmatched: rows.length - matched.length,
    leftOut: matched.length - kept.length,
    copies: ready.reduce((sum, row) => sum + row.quantity, 0),
    items: new Set(ready.map((row) => `${row.printing?.id}|${row.condition}`)).size,
    mergedItems: new Set(
      ready
        .filter((row) => row.ownedQuantity > 0)
        .map((row) => `${row.printing?.id}|${row.condition}`)
    ).size,
    defaultConditions: matched.filter((row) => row.conditionSource === 'DEFAULT').length,
  });
}

/**
 * A stand-in for the import API that keeps one preview and its rows, so a test can follow an edit
 * from the press to the counts on screen. `routes` are the handlers; `state` is what it holds.
 */
function fakeImports(options: { open?: InventoryImport | null; rows?: ImportRow[] } = {}) {
  const state = {
    preview: options.open === undefined ? null : options.open,
    rows: options.rows ?? deckRows(),
  };
  const view = (): InventoryImport => ({
    ...(state.preview as InventoryImport),
    summary: summarise(state.rows),
  });
  const routes: MockRoutes = {
    [`GET ${IMPORTS}/limits`]: ok(IMPORT_LIMITS),
    [`GET ${IMPORTS}`]: () => ok(state.preview ? [view()] : []),
    [`POST ${IMPORTS}`]: ({ query }: MockRequest) => {
      state.preview = importFixture({
        source: query.get('source') === 'COLLECTR_CSV' ? 'COLLECTR_CSV' : 'YDK',
        sections:
          query.get('source') === 'COLLECTR_CSV'
            ? (null as unknown as InventoryImport['sections'])
            : importFixture().sections,
      });
      return ok(view(), 201);
    },
    [`GET ${IMPORTS}/{id}`]: () => ok(view()),
    [`GET ${IMPORTS}/{id}/rows`]: ({ query }: MockRequest) => {
      const status = query.get('status');
      return ok(rowPage(state.rows.filter((row) => !status || row.status === status)));
    },
    [`PATCH ${IMPORTS}/{id}`]: ({ body }: MockRequest) => {
      const preview = state.preview as InventoryImport;
      state.preview = {
        ...preview,
        sections: { ...preview.sections!, ...(body as object) },
      };
      state.rows = state.rows.map((row) => {
        const inScope =
          (state.preview!.sections!.includeMain && (row.deck?.main ?? 0) > 0) ||
          (state.preview!.sections!.includeExtra && (row.deck?.extra ?? 0) > 0) ||
          (state.preview!.sections!.includeSide && (row.deck?.side ?? 0) > 0);
        return { ...row, inScope, willImport: row.status === 'READY' && row.included && inScope };
      });
      return ok(view());
    },
    [`PATCH ${IMPORTS}/{id}/rows/{rowId}`]: ({ path, body }: MockRequest) => {
      const id = path.split('/').pop();
      const patch = body as {
        printingId?: string | null;
        condition?: string;
        quantity?: number | null;
        included?: boolean;
      };
      state.rows = state.rows.map((row) => {
        if (row.id !== id) {
          return row;
        }
        const next = { ...row };
        if (patch.printingId !== undefined) {
          const printing = HERON_PRINTINGS.find((candidate) => candidate.id === patch.printingId);
          next.printing = printing;
          next.status = printing ? 'READY' : 'CHOOSE_PRINTING';
          next.printingChoice = printing ? 'MANUAL' : null;
        }
        if (patch.condition) {
          next.condition = patch.condition;
          next.conditionSource = 'EDITED';
        }
        if (patch.quantity !== undefined) {
          next.quantity = patch.quantity ?? next.fileQuantity;
          next.quantityEdited = patch.quantity !== null;
        }
        if (patch.included !== undefined) {
          next.included = patch.included;
        }
        next.willImport = next.status === 'READY' && next.included && next.inScope;
        return next;
      });
      return ok({ row: state.rows.find((row) => row.id === id), preview: view() });
    },
    [`POST ${IMPORTS}/{id}/bulk`]: ({ body }: MockRequest) => {
      const action = body as { action: string; condition?: string };
      let updated = 0;
      state.rows = state.rows.map((row) => {
        if (action.action === 'USE_MOST_RECENT_PRINTING' && row.status === 'CHOOSE_PRINTING') {
          updated++;
          return {
            ...row,
            status: 'READY',
            printing: HERON_PRINTINGS[1],
            printingChoice: 'MOST_RECENT',
            willImport: row.included && row.inScope,
          };
        }
        if (
          action.action === 'SET_CONDITION' &&
          row.status !== 'UNMATCHED' &&
          row.conditionSource === 'DEFAULT'
        ) {
          updated++;
          return { ...row, condition: action.condition ?? row.condition };
        }
        return row;
      });
      return ok({ updated, assumed: 0, undecided: 0, preview: view() });
    },
    [`POST ${IMPORTS}/{id}/commit`]: () => {
      const summary = summarise(state.rows);
      state.preview = {
        ...(state.preview as InventoryImport),
        status: 'COMMITTED',
        committedAt: '2026-10-13T12:10:00Z',
        result: {
          itemsCreated: summary.items - summary.mergedItems,
          itemsMerged: summary.mergedItems,
          copiesAdded: summary.copies,
          rowsImported: summary.ready,
          copiesNotAdded: 0,
          chunksDone: 1,
          totalChunks: 1,
        },
      };
      return ok(view());
    },
    [`DELETE ${IMPORTS}/{id}`]: () => {
      state.preview = null;
      return noContent;
    },
    'GET /api/v1/cards/{id}': ok(
      cardDetailFixture({
        id: HERON_CARD,
        game: 'yugioh',
        name: 'Fixture Clockwork Heron',
        printings: HERON_PRINTINGS,
      })
    ),
    'GET /api/v1/public/feature-flags': ok({}),
  };
  return { state, routes };
}

/** From the first screen to the preview of a pasted deck file. */
async function pasteDeck() {
  fireEvent.press(await screen.findByTestId('import-source-YDK'));
  fireEvent.press(screen.getByTestId('import-paste'));
  fireEvent.changeText(screen.getByTestId('import-paste-text'), DECK_TEXT);
  fireEvent.press(screen.getByTestId('import-paste-submit'));
  await screen.findByTestId('import-summary');
}

/** Opens the flow on a preview the collector left open. */
async function continueOpen() {
  fireEvent.press(await screen.findByTestId('import-open-continue'));
  await screen.findByTestId('import-summary');
}

describe('Import cards: the source and the file', () => {
  it('shows a skeleton, then the two sources with what each file is', async () => {
    const fake = fakeImports();
    mockApi(signedInRoutes(fake.routes));
    render();
    expect(screen.getByTestId('import-start-loading')).toBeOnTheScreen();
    const deck = await screen.findByRole('button', { name: 'Yu-Gi-Oh! deck file (.ydk)' });
    expect(deck).toHaveTextContent(/deck builder.*“Export” or “Download YDK”/);
    expect(screen.getByRole('button', { name: 'Collectr CSV export' })).toHaveTextContent(
      /never connects to Collectr and never reads its prices/
    );
    expect(screen.queryByTestId('import-open')).toBeNull();
    // Nothing to lose yet: leaving is not held back.
    expect(mockLeave.held).toBe(false);
  });

  it('explains a list of imports that could not load, with a retry', async () => {
    const fake = fakeImports();
    mockApi(
      signedInRoutes({
        ...fake.routes,
        [`GET ${IMPORTS}`]: [problem(503, 'SERVICE_UNAVAILABLE', 'down'), ok([])],
      })
    );
    render();
    expect(await screen.findByText('The import could not open')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('import-start-error-retry'));
    expect(await screen.findByTestId('import-source-YDK')).toBeOnTheScreen();
  });

  it('uploads a pasted deck file as a multipart file and opens its preview', async () => {
    const fake = fakeImports();
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    fireEvent.press(await screen.findByTestId('import-source-YDK'));
    expect(await screen.findByTestId('import-limits')).toHaveTextContent(
      'Up to 100 kB and 500 lines.'
    );
    fireEvent.press(screen.getByRole('button', { name: 'Paste the text of the file' }));
    // Nothing typed: said, not sent.
    fireEvent.press(screen.getByRole('button', { name: 'Use this text' }));
    expect(screen.getByTestId('import-refusal')).toHaveTextContent(/Nothing to import yet/);
    fireEvent.changeText(screen.getByLabelText('Text of the deck file'), DECK_TEXT);
    // A pasted text would be lost by leaving: leaving is held back.
    await waitFor(() => expect(mockLeave.held).toBe(true));
    fireEvent.press(screen.getByRole('button', { name: 'Use this text' }));

    await screen.findByTestId('import-summary');
    const upload = api.callsTo(`POST ${IMPORTS}`)[0];
    expect(upload?.query.get('source')).toBe('YDK');
    expect(upload?.query.has('game')).toBe(false);
    expect(upload?.headers.get('content-type')).toMatch(/multipart\/form-data/);
    // The text went the road of a file: written to the cache, sent as the part `file`.
    expect(mockWritten).toEqual([DECK_TEXT]);
    expect(String(upload?.body)).toContain('name="file"');
  });

  it('uploads a file chosen with the system file picker', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/DocumentPicker/3C1D.ydk',
          name: 'deck.ydk',
          size: 64,
          lastModified: 0,
        },
      ],
    });
    const fake = fakeImports();
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    fireEvent.press(await screen.findByTestId('import-source-YDK'));
    fireEvent.press(screen.getByRole('button', { name: 'Choose a file' }));
    await screen.findByTestId('import-summary');
    expect(api.callsTo(`POST ${IMPORTS}`)).toHaveLength(1);
    expect(mockWritten).toEqual([]);
    // The copy the picker made of the file does not stay in the app's cache.
    await waitFor(() => expect(mockDeleted).toEqual(['file:///cache/DocumentPicker/3C1D.ydk']));
  });

  it('does not keep the copy of a picked file the API refused, nor of one that replaces nothing after all', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/DocumentPicker/77AA.ydk',
          name: 'photo.ydk',
          size: 64,
          lastModified: 0,
        },
      ],
    });
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(
      signedInRoutes({
        ...fake.routes,
        [`POST ${IMPORTS}`]: problem(415, 'UNSUPPORTED_MEDIA_TYPE', 'not text', {
          reason: 'NOT_TEXT',
        }),
      })
    );
    render();
    fireEvent.press(await screen.findByTestId('import-source-YDK'));
    // "Keep it": the open import stays, the new file is dropped and so is its copy.
    fireEvent.press(screen.getByRole('button', { name: 'Choose a file' }));
    fireEvent.press(
      within(await screen.findByTestId('import-replace-dialog')).getByRole('button', {
        name: 'Keep it',
      })
    );
    await waitFor(() => expect(mockDeleted).toEqual(['file:///cache/DocumentPicker/77AA.ydk']));
    expect(api.callsTo(`POST ${IMPORTS}`)).toHaveLength(0);

    // "Replace it", and the API refuses the file: the copy goes all the same.
    mockDeleted.length = 0;
    fireEvent.press(screen.getByRole('button', { name: 'Choose a file' }));
    fireEvent.press(
      within(await screen.findByTestId('import-replace-dialog')).getByRole('button', {
        name: 'Replace it',
      })
    );
    expect(await screen.findByTestId('import-refusal')).toHaveTextContent(
      /could not be read as text/
    );
    expect(mockDeleted).toEqual(['file:///cache/DocumentPicker/77AA.ydk']);
  });

  it('does nothing when the picker is closed, and refuses a file that is too large before any upload', async () => {
    picker.getDocumentAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    const fake = fakeImports();
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    fireEvent.press(await screen.findByTestId('import-source-YDK'));
    await screen.findByTestId('import-limits');
    fireEvent.press(screen.getByTestId('import-choose-file'));
    await waitFor(() => expect(picker.getDocumentAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('import-refusal')).toBeNull();

    picker.getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/DocumentPicker/big.ydk',
          name: 'big.ydk',
          size: 500_000,
          lastModified: 0,
        },
      ],
    });
    fireEvent.press(screen.getByTestId('import-choose-file'));
    const refusal = await screen.findByTestId('import-refusal');
    expect(refusal).toHaveTextContent(/This file is too large/);
    expect(refusal).toHaveTextContent(/A deck file can be up to 100 kB\./);
    expect(api.callsTo(`POST ${IMPORTS}`)).toHaveLength(0);
    // Refused on the phone: not sent, and its copy is not kept either.
    expect(mockDeleted).toEqual(['file:///cache/DocumentPicker/big.ydk']);
  });

  it.each([
    [
      'not a text file',
      problem(415, 'UNSUPPORTED_MEDIA_TYPE', 'not text', { reason: 'NOT_TEXT' }),
      /This file could not be read as text.*choose the \.ydk file itself/,
    ],
    [
      'too many lines',
      problem(400, 'VALIDATION_FAILED', 'too many', { reason: 'TOO_MANY_LINES', fileLimit: 500 }),
      /This file has too many lines.*up to 500 lines/,
    ],
    [
      'too many imports',
      problem(429, 'RATE_LIMITED', 'slow down', { retryAfterSeconds: 120 }),
      /Too many imports in a short time.*again in 2 minutes/,
    ],
  ])('says in words why the API refused a file: %s', async (_name, answer, wording) => {
    const fake = fakeImports();
    mockApi(signedInRoutes({ ...fake.routes, [`POST ${IMPORTS}`]: answer }));
    render();
    fireEvent.press(await screen.findByTestId('import-source-YDK'));
    fireEvent.press(screen.getByTestId('import-paste'));
    fireEvent.changeText(screen.getByTestId('import-paste-text'), 'x');
    fireEvent.press(screen.getByTestId('import-paste-submit'));
    const refusal = await screen.findByTestId('import-refusal');
    expect(refusal).toHaveTextContent(wording);
    // An alert a screen reader says; the collector can try again.
    expect(refusal.props.accessibilityRole).toBe('alert');
    expect(screen.getByTestId('import-paste-submit')).not.toBeDisabled();
  });

  it('names the column a CSV lacks, and sends the game chosen for rows that name none', async () => {
    const fake = fakeImports({ rows: [rowFixture({ deck: undefined })] });
    const api = mockApi(
      signedInRoutes({
        ...fake.routes,
        [`POST ${IMPORTS}`]: [
          problem(400, 'VALIDATION_FAILED', 'missing', {
            reason: 'MISSING_COLUMNS',
            missingColumns: ['card name'],
          }),
          fake.routes[`POST ${IMPORTS}`] as never,
        ],
      })
    );
    render();
    fireEvent.press(await screen.findByTestId('import-source-COLLECTR_CSV'));
    expect(await screen.findByTestId('import-limits')).toHaveTextContent(
      'Up to 2 MB and 5,000 rows.'
    );
    fireEvent.press(screen.getByTestId('import-paste'));
    fireEvent.changeText(screen.getByLabelText('Text of the CSV export'), 'Set,Quantity\nA,1\n');
    fireEvent.press(screen.getByTestId('import-paste-submit'));
    expect(await screen.findByTestId('import-refusal')).toHaveTextContent(
      /A column could not be found.*no “card name” column/
    );

    fireEvent.press(screen.getByTestId('import-game'));
    fireEvent.press(await screen.findByTestId('import-game-option-yugioh'));
    fireEvent.press(screen.getByTestId('import-paste-submit'));
    await screen.findByTestId('import-summary');
    const uploads = api.callsTo(`POST ${IMPORTS}`);
    expect(uploads[0]?.query.get('source')).toBe('COLLECTR_CSV');
    expect(uploads[0]?.query.has('game')).toBe(false);
    expect(uploads[1]?.query.get('game')).toBe('yugioh');
    // A CSV has no deck sections.
    expect(screen.queryByTestId('import-sections')).toBeNull();
  });

  it('shows progress while the file is read, and blocks a second upload', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const fake = fakeImports();
    const create = fake.routes[`POST ${IMPORTS}`] as (request: MockRequest) => unknown;
    const api = mockApi(
      signedInRoutes({
        ...fake.routes,
        [`POST ${IMPORTS}`]: async (request) => {
          await new Promise((resolve) => {
            answer = resolve;
          });
          return create(request) as never;
        },
      })
    );
    render();
    fireEvent.press(await screen.findByTestId('import-source-YDK'));
    fireEvent.press(screen.getByTestId('import-paste'));
    fireEvent.changeText(screen.getByTestId('import-paste-text'), DECK_TEXT);
    fireEvent.press(screen.getByTestId('import-paste-submit'));
    const progress = await screen.findByTestId('import-uploading');
    expect(progress.props.accessibilityRole).toBe('progressbar');
    expect(progress.props.accessibilityLabel).toBe('Reading your file and matching its cards');
    expect(screen.getByTestId('import-paste-submit')).toBeDisabled();
    expect(screen.getByTestId('import-choose-file')).toBeDisabled();
    fireEvent.press(screen.getByTestId('import-paste-submit'));
    await act(async () => answer(undefined));
    await screen.findByTestId('import-summary');
    expect(api.callsTo(`POST ${IMPORTS}`)).toHaveLength(1);
  });
});

describe('Import cards: the preview', () => {
  it('says on top what the import adds, and names every control for a screen reader', async () => {
    const fake = fakeImports();
    mockApi(signedInRoutes(fake.routes));
    render();
    await pasteDeck();

    expect(screen.getByLabelText('1 new card')).toBeOnTheScreen();
    expect(screen.getByLabelText('0 added to cards you own')).toBeOnTheScreen();
    expect(screen.getByLabelText('2 need a printing')).toBeOnTheScreen();
    expect(screen.getByLabelText('1 not recognised')).toBeOnTheScreen();
    expect(screen.getByTestId('import-summary-sentence')).toHaveTextContent(
      'Your file lists 4 different cards. 1 is ready to add: 2 copies.'
    );
    expect(screen.getByTestId('import-kept-until')).toHaveTextContent(
      /Nothing is added until you confirm at the bottom\. This preview is kept until/
    );
    // The three sections of a deck, with the copies the file holds in each.
    const main = screen.getByRole('switch', { name: 'Main deck' });
    expect(main.props.accessibilityHint).toBe('3 copies in your file');
    expect(screen.getByRole('switch', { name: 'Side deck' }).props.accessibilityHint).toBe(
      '2 copies in your file'
    );

    // A recognised line: in or out, which copy, condition and copies.
    const wisp = await screen.findByTestId('import-row-0');
    expect(
      within(wisp).getByRole('checkbox', { name: 'Import Fixture Lantern Wisp' })
    ).toBeChecked();
    expect(
      within(wisp).getByRole('button', {
        name: 'Which copy of Fixture Lantern Wisp: YDKF-EN001 · Rare · YDK Fixtures',
      })
    ).toBeOnTheScreen();
    expect(
      within(wisp).getByRole('button', {
        name: 'Condition and copies of Fixture Lantern Wisp: Damaged (not in your file), 2 copies',
      })
    ).toBeOnTheScreen();
    expect(wisp).toHaveTextContent(/Main 2/);
    // A line to choose says so.
    expect(
      within(screen.getByTestId('import-row-1')).getByRole('button', {
        name: 'Which copy of Fixture Clockwork Heron: Choose printing',
      })
    ).toBeOnTheScreen();
    // A line nothing fits: one sentence, no control.
    const unknown = screen.getByTestId('import-row-3');
    expect(unknown.props.accessibilityLabel).toBe(
      'Not recognised: Passcode 919999999, 1 copy, Side 1, No card of the catalog has this passcode (the number printed in the lower left corner of a card)., If you know which card it is, find the card by its name with “Add card” in your inventory.'
    );
    expect(within(unknown).queryByRole('button')).toBeNull();
    expect(within(unknown).queryByRole('checkbox')).toBeNull();

    // The commit says why it cannot be pressed.
    const commit = screen.getByTestId('import-commit');
    expect(commit).toBeDisabled();
    expect(commit.props.accessibilityLabel).toBe('Add 1 card (2 copies) to my inventory');
    expect(commit.props.accessibilityHint).toBe(
      '2 cards still need a printing. Choose them, or leave them out.'
    );
    // It stays on screen under the list: its text follows the system size only a little.
    expect(
      within(commit).getByText('Add 1 card (2 copies) to my inventory').props.maxFontSizeMultiplier
    ).toBe(PINNED_MAX_FONT_SCALE);
    // So does the filter, which stays on screen above the list (not at the end of a long top).
    const bar = screen.getByTestId('import-filter-bar');
    expect(within(bar).getByRole('radio', { name: 'All (4)' })).toBeChecked();
    expect(within(bar).getByText('Needs a printing (2)').props.maxFontSizeMultiplier).toBe(
      PINNED_MAX_FONT_SCALE
    );
    expect(within(screen.getByTestId('import-preview-header')).queryByRole('radio')).toBeNull();
    expect(screen.getByTestId('import-commit-reason')).toHaveTextContent(
      '2 cards still need a printing. Choose them, or leave them out.'
    );
    // An open preview holds the screen: leaving asks first.
    expect(mockLeave.held).toBe(true);
  });

  it('switches a deck section off and shows the new counts', async () => {
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    await screen.findByTestId('import-row-2');
    fireEvent.press(screen.getByRole('switch', { name: 'Extra deck' }));
    await waitFor(() =>
      expect(screen.getByTestId('import-summary-sentence')).toHaveTextContent(
        'Your file lists 4 different cards. 1 is ready to add: 2 copies. 1 left out.'
      )
    );
    expect(api.callsTo(`PATCH ${IMPORTS}/{id}`)[0]?.body).toEqual({ includeExtra: false });
    expect(screen.getByRole('switch', { name: 'Extra deck' })).not.toBeChecked();
    // The line of that section says why it does not go in.
    await waitFor(() =>
      expect(screen.getByTestId('import-row-2-state')).toHaveTextContent(
        'Its deck section is switched off'
      )
    );
  });

  it('chooses a printing in the “Which copy” sheet and saves it at once', async () => {
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    fireEvent.press(await screen.findByTestId('import-row-1-printing'));
    const sheet = await screen.findByTestId('import-printing-sheet');
    expect(within(sheet).getByTestId('import-printing-card')).toHaveTextContent(
      'Fixture Clockwork Heron'
    );
    expect(await within(sheet).findByText('2 printings. Pick the one you own.')).toBeOnTheScreen();
    fireEvent.press(within(sheet).getByTestId(`printing-${HERON_FIRST}`));
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Which copy of Fixture Clockwork Heron: YDKF-EN002 · Rare · YDK Fixtures',
        })
      ).toBeOnTheScreen()
    );
    const patch = api.callsTo(`PATCH ${IMPORTS}/{id}/rows/{rowId}`)[0];
    expect(patch?.path).toBe(`${IMPORTS}/${IMPORT_ID}/rows/row-1`);
    expect(patch?.body).toEqual({ printingId: HERON_FIRST });
    expect(screen.getByLabelText('1 needs a printing')).toBeOnTheScreen();
  });

  it('lists the printings that fit a CSV row first, and can put a row back to “Choose printing”', async () => {
    const fake = fakeImports({
      open: importFixture({ source: 'COLLECTR_CSV', sections: null as never }),
      rows: [
        chooseRow({
          id: 'row-0',
          position: 0,
          deck: undefined,
          status: 'READY',
          printing: HERON_PRINTINGS[1],
          printingChoice: 'MANUAL',
          suggestedPrintingIds: [HERON_PRINTINGS[1]!.id!],
        }),
      ],
    });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    fireEvent.press(await screen.findByTestId('import-row-0-printing'));
    const sheet = await screen.findByTestId('import-printing-sheet');
    expect(await within(sheet).findByText('Fits your file')).toBeOnTheScreen();
    expect(
      within(within(sheet).getByTestId('import-printings-suggested')).getAllByRole('radio')
    ).toHaveLength(1);
    expect(within(sheet).getByText('Other printings')).toBeOnTheScreen();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Decide later' }));
    await waitFor(() =>
      expect(api.callsTo(`PATCH ${IMPORTS}/{id}/rows/{rowId}`)[0]?.body).toEqual({
        printingId: null,
      })
    );
  });

  it('edits the condition and the copies of a line in a dialog', async () => {
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    fireEvent.press(await screen.findByTestId('import-row-0-edit'));
    const dialog = await screen.findByTestId('import-row-dialog');
    // The default condition is shown and explained.
    expect(dialog).toHaveTextContent(/Your file does not say the condition of this card/);
    fireEvent.changeText(within(dialog).getByLabelText('Copies'), '0');
    fireEvent.press(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('At least 1 copy.')).toBeOnTheScreen();
    expect(api.callsTo(`PATCH ${IMPORTS}/{id}/rows/{rowId}`)).toHaveLength(0);
    fireEvent.press(within(dialog).getByRole('radio', { name: 'Near Mint' }));
    fireEvent.changeText(within(dialog).getByLabelText('Copies'), '3');
    fireEvent.press(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByTestId('import-row-dialog')).toBeNull());
    expect(api.callsTo(`PATCH ${IMPORTS}/{id}/rows/{rowId}`)[0]?.body).toEqual({
      condition: 'NEAR_MINT',
      quantity: 3,
    });
    expect(
      screen.getByRole('button', {
        name: 'Condition and copies of Fixture Lantern Wisp: Near Mint, 3 copies',
      })
    ).toBeOnTheScreen();
    expect(screen.getByTestId('import-summary-sentence')).toHaveTextContent(
      /1 is ready to add: 3 copies\./
    );
  });

  it('leaves a line out at once, and puts it back when the API refuses', async () => {
    const fake = fakeImports({ open: importFixture() });
    const update = fake.routes[`PATCH ${IMPORTS}/{id}/rows/{rowId}`] as never;
    const api = mockApi(
      signedInRoutes({
        ...fake.routes,
        [`PATCH ${IMPORTS}/{id}/rows/{rowId}`]: [update, problem(500, 'INTERNAL_ERROR', 'boom')],
      })
    );
    render();
    await continueOpen();
    const box = await screen.findByRole('checkbox', { name: 'Import Fixture Lantern Wisp' });
    fireEvent.press(box);
    expect(await screen.findByTestId('import-row-0-state')).toHaveTextContent('Left out');
    await waitFor(() =>
      expect(api.callsTo(`PATCH ${IMPORTS}/{id}/rows/{rowId}`)[0]?.body).toEqual({
        included: false,
      })
    );
    await waitFor(() => expect(screen.getByLabelText('0 new cards')).toBeOnTheScreen());

    // Put back, refused: the box shows what the API still holds, and the refusal is said.
    fireEvent.press(screen.getByRole('checkbox', { name: 'Import Fixture Lantern Wisp' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Please try again in a moment.'
    );
    expect(screen.getByRole('checkbox', { name: 'Import Fixture Lantern Wisp' })).not.toBeChecked();
  });

  it('uses the most recent printing for all unchosen rows, and sets one condition for all', async () => {
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    fireEvent.press(
      await screen.findByRole('button', {
        name: 'Use the most recent printing for all unchosen rows',
      })
    );
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      '2 cards got their most recent printing.'
    );
    expect(api.callsTo(`POST ${IMPORTS}/{id}/bulk`)[0]?.body).toEqual({
      action: 'USE_MOST_RECENT_PRINTING',
    });
    await waitFor(() => expect(screen.queryByTestId('import-unchosen')).toBeNull());
    expect(screen.getByLabelText('0 need a printing')).toBeOnTheScreen();

    // A deck file names no condition: one for all of them.
    expect(screen.getByTestId('import-default-conditions')).toHaveTextContent(
      /does not say the condition of 3 cards/
    );
    fireEvent.press(screen.getByRole('button', { name: 'Set one condition for these 3 cards' }));
    fireEvent.press(await screen.findByTestId('import-condition-NEAR_MINT'));
    await waitFor(() =>
      expect(api.callsTo(`POST ${IMPORTS}/{id}/bulk`)[1]?.body).toEqual({
        action: 'SET_CONDITION',
        condition: 'NEAR_MINT',
      })
    );
    expect(await screen.findByText('3 cards set to Near Mint.')).toBeOnTheScreen();
    // The game's own conditions are offered (the test catalog has two for Yu-Gi-Oh!).
    expect(screen.queryByTestId('import-condition-DAMAGED')).toBeNull();
  });

  it('filters the lines that need a printing and those not recognised', async () => {
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    await screen.findByTestId('import-row-0');
    fireEvent.press(screen.getByRole('radio', { name: 'Needs a printing (2)' }));
    await waitFor(() => expect(screen.queryByTestId('import-row-0')).toBeNull());
    expect(await screen.findByTestId('import-row-1')).toBeOnTheScreen();
    expect(api.callsTo(`GET ${IMPORTS}/{id}/rows`).at(-1)?.query.get('status')).toBe(
      'CHOOSE_PRINTING'
    );
    fireEvent.press(screen.getByRole('radio', { name: 'Not recognised (1)' }));
    const unknown = await screen.findByTestId('import-row-3');
    expect(unknown).toHaveTextContent(/Not recognised.*Passcode 919999999/);
    expect(api.callsTo(`GET ${IMPORTS}/{id}/rows`).at(-1)?.query.get('status')).toBe('UNMATCHED');
  });

  it('says which cards got the plain copy and which the most recent printing could not decide', async () => {
    const fake = fakeImports({ open: importFixture() });
    mockApi(
      signedInRoutes({
        ...fake.routes,
        // One card has a 1st Edition and an Unlimited copy in its most recent set (the plain copy
        // is taken); the other has two rarities there (nothing decides).
        [`POST ${IMPORTS}/{id}/bulk`]: () => {
          fake.state.rows = fake.state.rows.map((row) =>
            row.id === 'row-1'
              ? {
                  ...row,
                  status: 'READY',
                  printing: HERON_PRINTINGS[1],
                  printingChoice: 'MOST_RECENT_ASSUMED',
                  willImport: true,
                }
              : row
          );
          return ok({
            updated: 1,
            assumed: 1,
            undecided: 1,
            preview: {
              ...(fake.state.preview as InventoryImport),
              summary: summarise(fake.state.rows),
            },
          });
        },
      })
    );
    render();
    await continueOpen();
    fireEvent.press(
      await screen.findByRole('button', {
        name: 'Use the most recent printing for all unchosen rows',
      })
    );
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      '1 card got its most recent printing. Its most recent set has several versions: the plain copy (Unlimited, no foil) was taken. Check it. 1 card has several printings in its most recent set: choose it.'
    );
    // The line keeps saying that its copy was assumed, and stays editable.
    expect(await screen.findByTestId('import-row-1-assumed')).toHaveTextContent(
      /Taken as the plain copy \(Unlimited, no foil\)/
    );
    expect(screen.getByTestId('import-row-1-printing')).not.toBeDisabled();
    // The card nothing could decide still asks: nothing was taken for the collector.
    await waitFor(() => expect(screen.getByLabelText('1 needs a printing')).toBeOnTheScreen());
    expect(
      screen.getByRole('button', { name: 'Which copy of Fixture Clockwork Heron: Choose printing' })
    ).toBeOnTheScreen();
    expect(screen.getByTestId('import-commit')).toBeDisabled();
  });

  it('shows the lines a count stands for when the count is pressed', async () => {
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    await screen.findByTestId('import-row-0');
    fireEvent.press(screen.getByRole('button', { name: '1 not recognised' }));
    await waitFor(() => expect(screen.queryByTestId('import-row-0')).toBeNull());
    expect(await screen.findByTestId('import-row-3')).toBeOnTheScreen();
    expect(api.callsTo(`GET ${IMPORTS}/{id}/rows`).at(-1)?.query.get('status')).toBe('UNMATCHED');
    expect(
      within(screen.getByTestId('import-filter-bar')).getByRole('radio', {
        name: 'Not recognised (1)',
      })
    ).toBeChecked();
  });

  it('says on top, before any commit, that the plan has no room for the import', async () => {
    const fake = fakeImports({ open: importFixture(), rows: [rowFixture(), unmatchedRow()] });
    const plan = planFixture();
    mockApi(
      signedInRoutes({
        ...fake.routes,
        'GET /api/v1/me/plan': ok({
          ...plan,
          limits: [
            ...(plan.limits ?? []),
            {
              key: 'inventory.items.max',
              allowed: false,
              kind: 'COUNTER',
              window: 'TOTAL',
              limit: 500,
              used: 500,
              remaining: 0,
              planCode: 'FREE',
            },
          ],
        }),
      })
    );
    render();
    await continueOpen();
    const room = await screen.findByTestId('import-plan-room');
    expect(
      within(room).getByText(
        'Your plan has no room for a new card and this import adds 1 new card: leave 1 out. Copies added to cards you already have always fit.'
      )
    ).toBeOnTheScreen();
  });

  it('says nothing about the plan while the import fits, or the plan has no limit', async () => {
    const fake = fakeImports({ open: importFixture(), rows: [rowFixture()] });
    mockApi(signedInRoutes({ ...fake.routes, 'GET /api/v1/me/plan': ok(planFixture()) }));
    render();
    await continueOpen();
    await screen.findByTestId('import-row-0');
    expect(screen.queryByTestId('import-plan-room')).toBeNull();
  });

  it('says so when a filter has nothing to show', async () => {
    const fake = fakeImports({ open: importFixture(), rows: [rowFixture()] });
    mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    fireEvent.press(await screen.findByRole('radio', { name: 'Not recognised (0)' }));
    expect(await screen.findByText('Everything was recognised')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Show all different cards' })).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('import-rows-empty-action'));
    expect(await screen.findByTestId('import-row-0')).toBeOnTheScreen();
  });

  it('loads a long file page by page, and explains lines that could not load', async () => {
    const fake = fakeImports({ open: importFixture() });
    const pages = [
      rowPage([rowFixture()], 0, 2, 51),
      rowPage([rowFixture({ id: 'row-50', position: 50 })], 1, 2, 51),
    ];
    const api = mockApi(
      signedInRoutes({
        ...fake.routes,
        [`GET ${IMPORTS}/{id}/rows`]: [
          problem(503, 'SERVICE_UNAVAILABLE', 'down'),
          ({ query }) => ok(pages[Number(query.get('page') ?? 0)]),
        ],
      })
    );
    render();
    await continueOpen();
    expect(await screen.findByText('The list could not load')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('import-rows-error-retry'));
    await screen.findByTestId('import-row-0');
    expect(screen.queryByTestId('import-row-50')).toBeNull();
    fireEvent(screen.getByTestId('import-rows'), 'endReached');
    expect(await screen.findByTestId('import-row-50')).toBeOnTheScreen();
    const asked = api.callsTo(`GET ${IMPORTS}/{id}/rows`).map((call) => call.query.get('page'));
    expect(asked).toEqual(['0', '0', '1']);
    expect(api.callsTo(`GET ${IMPORTS}/{id}/rows`)[0]?.query.get('size')).toBe('50');
  });
});

describe('Import cards: the commit', () => {
  it('leaves unchosen cards out only when the collector says so, then shows the result', async () => {
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(signedInRoutes(fake.routes));
    const { queryClient } = render();
    // What the Inventory tab holds while the import runs.
    queryClient.setQueryData(INVENTORY_TOTALS, summaryFixture());
    await continueOpen();
    const commit = screen.getByTestId('import-commit');
    expect(commit).toBeDisabled();
    fireEvent.press(commit);
    expect(api.callsTo(`POST ${IMPORTS}/{id}/commit`)).toHaveLength(0);

    fireEvent.press(
      screen.getByRole('checkbox', {
        name: 'Leave out the 2 cards that still need a printing',
      })
    );
    expect(commit.props.accessibilityLabel).toBe('Add 1 card (2 copies), leave 2 out');
    expect(commit).not.toBeDisabled();
    fireEvent.press(commit);

    const result = await screen.findByTestId('import-result');
    expect(api.callsTo(`POST ${IMPORTS}/{id}/commit`)[0]?.body).toEqual({ skipUnresolved: true });
    expect(within(result).getByText('Import done')).toBeOnTheScreen();
    expect(within(result).getByLabelText('1 new card added')).toBeOnTheScreen();
    expect(
      within(result).getByLabelText('0 cards you already had got more copies')
    ).toBeOnTheScreen();
    expect(
      within(result).getByLabelText(
        '3 different cards of your file left out: 1 not recognised, 2 without a printing'
      )
    ).toBeOnTheScreen();
    expect(within(result).getByTestId('import-result-note')).toHaveTextContent(
      /^2 copies in all\. Everything this import added is private/
    );
    // The inventory is to be read again (its lists are stale), and nothing holds the screen any more.
    expect(queryClient.getQueryState(INVENTORY_TOTALS)?.isInvalidated).toBe(true);
    expect(mockLeave.held).toBe(false);
    fireEvent.press(within(result).getByRole('button', { name: 'Go to my inventory' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('waits for an edit that is still being saved: a card shown as left out is never imported', async () => {
    const fake = fakeImports({
      open: importFixture(),
      rows: [
        rowFixture(),
        rowFixture({ id: 'row-9', position: 9, printing: HERON_PRINTINGS[0] }),
        unmatchedRow(),
      ],
    });
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const update = fake.routes[`PATCH ${IMPORTS}/{id}/rows/{rowId}`] as (
      request: MockRequest
    ) => never;
    const commitRoute = fake.routes[`POST ${IMPORTS}/{id}/commit`] as (
      request: MockRequest
    ) => never;
    const api = mockApi(
      signedInRoutes({
        ...fake.routes,
        // A slow connection: the edits are on their way and not answered yet.
        [`PATCH ${IMPORTS}/{id}/rows/{rowId}`]: (async (request: MockRequest) => {
          order.push('edit received');
          await slow;
          order.push('edit answered');
          return update(request);
        }) as never,
        [`POST ${IMPORTS}/{id}/commit`]: ((request: MockRequest) => {
          order.push('commit received');
          return commitRoute(request);
        }) as never,
      })
    );
    render();
    await continueOpen();
    const commit = await screen.findByTestId('import-commit');
    await waitFor(() =>
      expect(commit.props.accessibilityLabel).toBe('Add 2 cards (4 copies) to my inventory')
    );
    expect(commit).not.toBeDisabled();

    // Two cards are left out one after the other; both show it at once.
    fireEvent.press(screen.getByTestId('import-row-0-include'));
    fireEvent.press(screen.getByTestId('import-row-9-include'));
    expect(await screen.findByTestId('import-row-0-state')).toHaveTextContent('Left out');
    expect(screen.getByTestId('import-row-9-state')).toHaveTextContent('Left out');
    await waitFor(() => expect(order).toEqual(['edit received']));

    // The count on the button is not the API's yet: it waits, says so, and a press does nothing.
    expect(commit).toBeDisabled();
    expect(screen.getByTestId('import-commit-reason')).toHaveTextContent('Saving your changes…');
    expect(commit.props.accessibilityHint).toBe('Saving your changes…');
    fireEvent.press(commit);
    expect(api.callsTo(`POST ${IMPORTS}/{id}/commit`)).toHaveLength(0);

    // The edits are answered: nothing is left to add, and the button says that.
    release();
    await waitFor(() =>
      expect(screen.getByTestId('import-commit-reason')).toHaveTextContent(
        'No card of this file is ready to be added.'
      )
    );
    expect(commit).toBeDisabled();
    expect(order).toEqual(['edit received', 'edit answered', 'edit received', 'edit answered']);
    expect(api.callsTo(`POST ${IMPORTS}/{id}/commit`)).toHaveLength(0);

    // One card back: the commit goes out after every edit, with the count the collector saw.
    fireEvent.press(screen.getByTestId('import-row-0-include'));
    await waitFor(() =>
      expect(commit.props.accessibilityLabel).toBe('Add 1 card (2 copies) to my inventory')
    );
    await waitFor(() => expect(commit).not.toBeDisabled());
    fireEvent.press(commit);
    const result = await screen.findByTestId('import-result');
    expect(order.at(-1)).toBe('commit received');
    expect(order.filter((step) => step === 'edit received')).toHaveLength(3);
    expect(within(result).getByLabelText('1 new card added')).toBeOnTheScreen();
    expect(
      within(result).getByLabelText(
        '2 different cards of your file left out: 1 not recognised, 1 left out by you'
      )
    ).toBeOnTheScreen();
  });

  it('keeps the lines that were not added readable on the result, with what to do about each', async () => {
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    fireEvent.press(
      await screen.findByRole('checkbox', {
        name: 'Leave out the 2 cards that still need a printing',
      })
    );
    fireEvent.press(screen.getByTestId('import-commit'));
    const result = await screen.findByTestId('import-result');

    // Not recognised: the passcode, where it stood in the deck, why, and what can be done.
    const unknown = within(result).getByTestId('import-result-unmatched');
    expect(unknown).toHaveTextContent(/Not recognised \(1\)/);
    fireEvent.press(within(unknown).getByRole('button', { name: 'Show these different cards' }));
    const line = await within(unknown).findByTestId('import-row-3');
    expect(line).toHaveTextContent(/Passcode 919999999/);
    expect(line).toHaveTextContent(/Side 1/);
    expect(line).toHaveTextContent(/find the card by its name with “Add card” in your inventory/);
    expect(api.callsTo(`GET ${IMPORTS}/{id}/rows`).at(-1)?.query.get('status')).toBe('UNMATCHED');

    // Without a printing: which cards, so they can be added by hand.
    const unchosen = within(result).getByTestId('import-result-unchosen');
    expect(unchosen).toHaveTextContent(/Without a printing \(2\)/);
    fireEvent.press(within(unchosen).getByRole('button', { name: 'Show these different cards' }));
    const heron = await within(unchosen).findByTestId('import-row-1');
    expect(heron).toHaveTextContent(/Fixture Clockwork Heron/);
    expect(heron).toHaveTextContent(/Passcode 910000002/);
    expect(heron).toHaveTextContent(/No printing was chosen/);
    expect(within(unchosen).queryByRole('checkbox')).toBeNull();
  });

  it('shows no list of left-out lines when every line went in', async () => {
    const fake = fakeImports({ open: importFixture(), rows: [rowFixture()] });
    mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    fireEvent.press(await screen.findByTestId('import-commit'));
    const result = await screen.findByTestId('import-result');
    expect(within(result).queryByTestId('import-result-unmatched')).toBeNull();
    expect(within(result).queryByTestId('import-result-unchosen')).toBeNull();
    expect(within(result).queryByTestId('import-result-late')).toBeNull();
  });

  it('sends skipUnresolved false when nothing is left to choose', async () => {
    const fake = fakeImports({ open: importFixture(), rows: [rowFixture(), unmatchedRow()] });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    const commit = screen.getByTestId('import-commit');
    expect(commit.props.accessibilityLabel).toBe('Add 1 card (2 copies) to my inventory');
    expect(screen.getByTestId('import-commit-reason')).toHaveTextContent(
      'It starts private: nobody sees it until you publish it.'
    );
    fireEvent.press(commit);
    await screen.findByTestId('import-result');
    expect(api.callsTo(`POST ${IMPORTS}/{id}/commit`)[0]?.body).toEqual({ skipUnresolved: false });
  });

  it('says how many cards go into cards already owned', async () => {
    const fake = fakeImports({
      open: importFixture(),
      rows: [
        rowFixture({ ownedQuantity: 2 }),
        rowFixture({ id: 'row-9', position: 9, printing: HERON_PRINTINGS[0] }),
      ],
    });
    mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    expect(screen.getByLabelText('1 added to a card you own')).toBeOnTheScreen();
    expect(await screen.findByTestId('import-row-0-owned')).toHaveTextContent(
      'You have 2: this adds 2.'
    );
    expect(screen.getByTestId('import-commit-reason')).toHaveTextContent(
      'New cards start private. 1 of them is added to a card you already have.'
    );
    fireEvent.press(screen.getByTestId('import-commit'));
    const result = await screen.findByTestId('import-result');
    expect(
      within(result).getByLabelText('1 card you already had got more copies')
    ).toBeOnTheScreen();
  });

  it('a commit pressed twice is sent once', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const fake = fakeImports({ open: importFixture(), rows: [rowFixture()] });
    const commitRoute = fake.routes[`POST ${IMPORTS}/{id}/commit`] as () => unknown;
    const api = mockApi(
      signedInRoutes({
        ...fake.routes,
        [`POST ${IMPORTS}/{id}/commit`]: async () => {
          await new Promise((resolve) => {
            answer = resolve;
          });
          return commitRoute() as never;
        },
      })
    );
    render();
    await continueOpen();
    const commit = screen.getByTestId('import-commit');
    fireEvent.press(commit);
    await waitFor(() => expect(commit).toBeDisabled());
    expect(commit.props.accessibilityLabel).toBe('Adding to your inventory…');
    fireEvent.press(commit);
    // The lines cannot be edited under a commit.
    expect(screen.getByTestId('import-row-0-include')).toBeDisabled();
    await act(async () => answer(undefined));
    await screen.findByTestId('import-result');
    expect(api.callsTo(`POST ${IMPORTS}/{id}/commit`)).toHaveLength(1);
  });

  it('a commit repeated after a lost connection is sent again and adds nothing twice', async () => {
    const fake = fakeImports({ open: importFixture(), rows: [rowFixture()] });
    const commitRoute = fake.routes[`POST ${IMPORTS}/{id}/commit`] as () => unknown;
    const api = mockApi(
      signedInRoutes({
        ...fake.routes,
        [`POST ${IMPORTS}/{id}/commit`]: [
          () => {
            throw new TypeError('Network request failed');
          },
          () => commitRoute() as never,
        ],
      })
    );
    render();
    await continueOpen();
    fireEvent.press(screen.getByTestId('import-commit'));
    expect(await screen.findByTestId('import-commit-error')).toHaveTextContent(
      /We could not reach OrenjiTrade\. Check your connection and try again\./
    );
    // Still the preview, still committable with the same button.
    expect(screen.getByTestId('import-summary')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('import-commit'));
    await screen.findByTestId('import-result');
    expect(api.callsTo(`POST ${IMPORTS}/{id}/commit`)).toHaveLength(2);
    expect(fake.state.preview?.result?.itemsCreated).toBe(1);
  });

  it('a commit that went through although its answer was lost shows its result without a second press', async () => {
    const fake = fakeImports({ open: importFixture(), rows: [rowFixture()] });
    const commitRoute = fake.routes[`POST ${IMPORTS}/{id}/commit`] as () => unknown;
    const api = mockApi(
      signedInRoutes({
        ...fake.routes,
        [`POST ${IMPORTS}/{id}/commit`]: () => {
          // Written on the server, the answer never arrives.
          commitRoute();
          throw new TypeError('Network request failed');
        },
      })
    );
    render();
    await continueOpen();
    fireEvent.press(screen.getByTestId('import-commit'));
    const result = await screen.findByTestId('import-result');
    expect(within(result).getByLabelText('1 new card added')).toBeOnTheScreen();
    expect(api.callsTo(`POST ${IMPORTS}/{id}/commit`)).toHaveLength(1);
  });

  it.each([
    [false, 0],
    [true, 1],
  ])(
    'shows the plan limit as the app shows limits (premium sold: %s)',
    async (premiumPlans, premiumButtons) => {
      const fake = fakeImports({ open: importFixture(), rows: [rowFixture()] });
      mockApi(
        signedInRoutes({
          ...fake.routes,
          'GET /api/v1/public/feature-flags': ok({ premiumPlans }),
          [`POST ${IMPORTS}/{id}/commit`]: problem(429, 'LIMIT_REACHED', 'limit reached', {
            limitKey: 'inventory.items.max',
            limit: 500,
            used: 500,
            requested: 1,
            planCode: 'FREE',
            upgradeUrl: '/premium',
          }),
        })
      );
      render();
      await continueOpen();
      fireEvent.press(screen.getByTestId('import-commit'));
      const notice = await screen.findByTestId('import-limit');
      expect(notice).toHaveTextContent(/This import does not fit your plan/);
      // The numbers to act on: what the import adds, what still fits, how many to leave out.
      expect(within(notice).getByTestId('import-limit-message')).toHaveTextContent(
        premiumPlans
          ? 'This import adds 1 new card and your plan has room for 0 (500 of 500 used). Leave 1 out and try again. Premium raises the limit.'
          : 'This import adds 1 new card and your plan has room for 0 (500 of 500 used). Leave 1 out and try again.'
      );
      await waitFor(() =>
        expect(screen.queryAllByTestId('import-limit-premium')).toHaveLength(premiumButtons)
      );
      // Nothing was written: the preview is still there to be edited.
      expect(screen.getByTestId('import-summary')).toBeOnTheScreen();
      expect(screen.getByTestId('import-commit')).not.toBeDisabled();
    }
  );
});

describe('Import cards: expiry, resuming, leaving', () => {
  it('a preview that expired says so and starts over', async () => {
    const fake = fakeImports({ open: importFixture() });
    mockApi(
      signedInRoutes({
        ...fake.routes,
        [`PATCH ${IMPORTS}/{id}/rows/{rowId}`]: problem(410, 'IMPORT_EXPIRED', 'expired'),
      })
    );
    render();
    await continueOpen();
    fireEvent.press(await screen.findByTestId('import-row-0-include'));
    const expired = await screen.findByTestId('import-expired');
    expect(expired).toHaveTextContent(/This preview expired/);
    expect(expired).toHaveTextContent(/Nothing was added to your inventory/);
    expect(mockLeave.held).toBe(false);
    fake.state.preview = null;
    fireEvent.press(screen.getByTestId('import-expired-action'));
    expect(await screen.findByTestId('import-source-YDK')).toBeOnTheScreen();
  });

  it('a preview past its time is not offered, and one that expires on screen says so', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const soon = new Date(Date.now() + 60_000).toISOString();
      const fake = fakeImports({ open: importFixture({ expiresAt: soon }) });
      mockApi(signedInRoutes(fake.routes));
      render();
      await continueOpen();
      await act(async () => {
        jest.advanceTimersByTime(61_000);
      });
      expect(await screen.findByTestId('import-expired')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('offers the import that was left open, and a commit that was cut can be finished', async () => {
    const cut = importFixture({
      status: 'COMMITTING',
      result: {
        itemsCreated: 500,
        itemsMerged: 0,
        copiesAdded: 500,
        rowsImported: 1200,
        copiesNotAdded: 0,
        chunksDone: 1,
        totalChunks: 3,
      },
    });
    const fake = fakeImports({ open: cut, rows: [rowFixture()] });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    const open = await screen.findByTestId('import-open');
    expect(open).toHaveTextContent(/Finish your import/);
    expect(open).toHaveTextContent(/Part 1 of 3 is in your inventory/);
    // A commit that started cannot be discarded.
    expect(screen.queryByTestId('import-open-discard')).toBeNull();
    fireEvent.press(within(open).getByRole('button', { name: 'Finish the import' }));
    const interrupted = await screen.findByTestId('import-interrupted');
    expect(interrupted).toHaveTextContent(/nothing is added twice/);
    // Nothing to lose on this screen: leaving is free.
    expect(mockLeave.held).toBe(false);
    fireEvent.press(within(interrupted).getByRole('button', { name: 'Finish the import' }));
    await screen.findByTestId('import-result');
    expect(api.callsTo(`POST ${IMPORTS}/{id}/commit`)).toHaveLength(1);
  });

  it('asks before leaving an open preview, and leaves only on “Leave”', async () => {
    const fake = fakeImports({ open: importFixture() });
    mockApi(signedInRoutes(fake.routes));
    render();
    const open = await screen.findByTestId('import-open');
    expect(open).toHaveTextContent(/Continue your import/);
    expect(open).toHaveTextContent(/Deck file · 4 different cards · kept until/);
    await continueOpen();
    expect(mockLeave.held).toBe(true);

    act(() => mockLeave.tryToLeave());
    const dialog = await screen.findByTestId('import-leave-dialog');
    expect(dialog).toHaveTextContent(/Leave this import\?/);
    expect(dialog).toHaveTextContent(
      /Nothing has been added to your inventory yet\. Your preview and the choices you made are kept until/
    );
    fireEvent.press(within(dialog).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByTestId('import-leave-dialog')).toBeNull());
    expect(mockDispatch).not.toHaveBeenCalled();

    act(() => mockLeave.tryToLeave());
    fireEvent.press(
      within(await screen.findByTestId('import-leave-dialog')).getByRole('button', {
        name: 'Leave',
      })
    );
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' }));
    // What was held back is carried out once, and the screen no longer holds.
    expect(mockLeave.held).toBe(false);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('discards an import only after a question', async () => {
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    await continueOpen();
    fireEvent.press(await screen.findByRole('button', { name: 'Discard this import' }));
    const dialog = await screen.findByTestId('import-discard-dialog');
    expect(dialog).toHaveTextContent(/The choices you made for it are lost/);
    fireEvent.press(within(dialog).getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.queryByTestId('import-discard-dialog')).toBeNull());
    expect(api.callsTo(`DELETE ${IMPORTS}/{id}`)).toHaveLength(0);

    fireEvent.press(screen.getByRole('button', { name: 'Discard this import' }));
    fireEvent.press(
      within(await screen.findByTestId('import-discard-dialog')).getByRole('button', {
        name: 'Discard',
      })
    );
    expect(await screen.findByTestId('import-source-YDK')).toBeOnTheScreen();
    expect(api.callsTo(`DELETE ${IMPORTS}/{id}`)[0]?.path).toBe(`${IMPORTS}/${IMPORT_ID}`);
    expect(screen.getByTestId('snackbar')).toHaveTextContent(
      'Import discarded. Nothing was added.'
    );
    expect(screen.queryByTestId('import-open')).toBeNull();
  });

  it('asks before a new file replaces the import that was left open', async () => {
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(signedInRoutes(fake.routes));
    render();
    await screen.findByTestId('import-open');
    expect(screen.getByText('Or start a new import')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('import-source-YDK'));
    fireEvent.press(screen.getByTestId('import-paste'));
    fireEvent.changeText(screen.getByTestId('import-paste-text'), DECK_TEXT);
    fireEvent.press(screen.getByTestId('import-paste-submit'));
    const dialog = await screen.findByTestId('import-replace-dialog');
    expect(dialog).toHaveTextContent(/Replace your open import\?/);
    expect(api.callsTo(`POST ${IMPORTS}`)).toHaveLength(0);
    fireEvent.press(within(dialog).getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.queryByTestId('import-replace-dialog')).toBeNull());
    expect(api.callsTo(`POST ${IMPORTS}`)).toHaveLength(0);
    // The pasted text is still there.
    expect(screen.getByTestId('import-paste-text').props.value).toBe(DECK_TEXT);

    fireEvent.press(screen.getByTestId('import-paste-submit'));
    fireEvent.press(
      within(await screen.findByTestId('import-replace-dialog')).getByRole('button', {
        name: 'Replace it',
      })
    );
    await screen.findByTestId('import-summary');
    expect(api.callsTo(`POST ${IMPORTS}`)).toHaveLength(1);
  });

  it('an import committed elsewhere shows its result instead of an error', async () => {
    const fake = fakeImports({ open: importFixture(), rows: [rowFixture()] });
    const commitRoute = fake.routes[`POST ${IMPORTS}/{id}/commit`] as () => unknown;
    mockApi(
      signedInRoutes({
        ...fake.routes,
        [`PATCH ${IMPORTS}/{id}/rows/{rowId}`]: () => {
          commitRoute();
          return problem(409, 'IMPORT_ALREADY_COMMITTED', 'committed', {
            currentStatus: 'COMMITTED',
          });
        },
      })
    );
    render();
    await continueOpen();
    fireEvent.press(await screen.findByTestId('import-row-0-include'));
    const result = await screen.findByTestId('import-result');
    // The change came too late and is not in the import: said, with the card to check.
    expect(
      within(within(result).getByTestId('import-result-late')).getByText(
        'This import was already added before your last change to Fixture Lantern Wisp was saved: that change is not in it. Check that card in your inventory.'
      )
    ).toBeOnTheScreen();
    // A new import starts without that notice.
    fake.state.preview = null;
    fireEvent.press(within(result).getByRole('button', { name: 'Import another file' }));
    expect(await screen.findByTestId('import-source-YDK')).toBeOnTheScreen();
  });

  it('lets the pages that end the flow scroll: at the largest text sizes their button stays in reach', async () => {
    // "This preview expired" and "The import could not load" are taller than the screen at the
    // accessibility text sizes: like every other step they are scroll views.
    const fake = fakeImports({ open: importFixture() });
    const api = mockApi(
      signedInRoutes({
        ...fake.routes,
        [`GET ${IMPORTS}/{id}`]: problem(503, 'SERVICE_UNAVAILABLE', 'down'),
      })
    );
    render();
    fireEvent.press(await screen.findByTestId('import-open-continue'));
    expect(await screen.findByTestId('import-error')).toBeOnTheScreen();
    const failed = screen.UNSAFE_getByType(ScrollView);
    expect(failed.props.testID).toBe('screen-import');
    expect(within(failed).getByTestId('import-error-retry')).toBeOnTheScreen();

    api.use({ [`GET ${IMPORTS}/{id}`]: problem(410, 'IMPORT_EXPIRED', 'expired') });
    fireEvent.press(screen.getByTestId('import-error-retry'));
    expect(await screen.findByTestId('import-expired')).toBeOnTheScreen();
    const expired = screen.UNSAFE_getByType(ScrollView);
    expect(expired.props.testID).toBe('screen-import');
    expect(within(expired).getByTestId('import-expired-action')).toBeOnTheScreen();
  });
});
