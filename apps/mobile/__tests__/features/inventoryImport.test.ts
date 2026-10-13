import { ApiError } from '@/src/api/ApiError';
import { quantityError, rowPatch } from '@/src/features/inventory/import/ImportRowEditDialog';
import { openImport } from '@/src/features/inventory/import/ImportStart';
import {
  IMPORT_SOURCES,
  commitState,
  conditionSetMessage,
  deckText,
  emptyFilterText,
  filterOptions,
  formatBytes,
  importRefusal,
  interruptedText,
  isExpired,
  leaveOutLabel,
  limitsHint,
  linesLeftOut,
  mostRecentMessage,
  newItems,
  openImportText,
  orderedPrintings,
  ownedText,
  refusalBeforeUpload,
  resultLines,
  resultSentence,
  rowConditionText,
  rowCopyLabel,
  rowSourceText,
  rowStateText,
  rowSummary,
  rowTitle,
  sectionSwitches,
  summarySentence,
  summaryStats,
  unmatchedReasonText,
  utf8Length,
} from '@/src/features/inventory/import/importLabels';
import { isImportGone } from '@/src/features/inventory/import/ImportPreview';

import {
  HERON_PRINTINGS,
  HERON_REPRINT,
  IMPORT_LIMITS,
  chooseRow,
  importFixture,
  rowFixture,
  summaryOf,
  unmatchedRow,
} from '../support/importFixtures';

function refusal(
  status: number,
  errorCode: string,
  extra: Record<string, unknown> = {},
  message = 'server wording'
): ApiError {
  return ApiError.fromProblem(status, { status, errorCode, message, ...extra });
}

describe('the two sources of an import', () => {
  it('say in one sentence what the file is and how to get it out of the other app', () => {
    expect(IMPORT_SOURCES.YDK.title).toBe('Yu-Gi-Oh! deck file (.ydk)');
    expect(IMPORT_SOURCES.YDK.description).toMatch(/deck builder.*“Export” or “Download YDK”/);
    expect(IMPORT_SOURCES.COLLECTR_CSV.title).toBe('Collectr CSV export');
    expect(IMPORT_SOURCES.COLLECTR_CSV.description).toMatch(/export your portfolio as CSV/);
    // OrenjiTrade never calls Collectr and never reads its prices: said where the file is asked for.
    expect(IMPORT_SOURCES.COLLECTR_CSV.description).toMatch(
      /never connects to Collectr and never reads its prices/
    );
  });
});

describe('what a file may be', () => {
  it('words sizes and the admin limits', () => {
    expect(formatBytes(102_400)).toBe('100 kB');
    expect(formatBytes(2_097_152)).toBe('2 MB');
    expect(formatBytes(1_572_864)).toBe('1.5 MB');
    expect(formatBytes(10)).toBe('1 kB');
    expect(limitsHint('YDK', IMPORT_LIMITS)).toBe('Up to 100 kB and 500 lines.');
    expect(limitsHint('COLLECTR_CSV', IMPORT_LIMITS)).toBe('Up to 2 MB and 5,000 rows.');
    expect(limitsHint('YDK', undefined)).toBeNull();
  });

  it('counts a pasted text as the bytes it is sent as', () => {
    expect(utf8Length('#main\n1')).toBe(7);
    expect(utf8Length('é')).toBe(2);
    expect(utf8Length('龍')).toBe(3);
    expect(utf8Length('🂡')).toBe(4);
  });

  it('refuses a file that is too large before anything is uploaded', () => {
    expect(refusalBeforeUpload('YDK', 102_400, IMPORT_LIMITS)).toBeNull();
    expect(refusalBeforeUpload('YDK', 102_401, IMPORT_LIMITS)).toEqual({
      title: 'This file is too large',
      message: 'A deck file can be up to 100 kB.',
    });
    expect(refusalBeforeUpload('COLLECTR_CSV', 3_000_000, IMPORT_LIMITS)?.message).toBe(
      'A CSV export can be up to 2 MB. Export your collection in smaller parts.'
    );
    // Unknown size or unknown limits: the API decides.
    expect(refusalBeforeUpload('YDK', null, IMPORT_LIMITS)).toBeNull();
    expect(refusalBeforeUpload('YDK', 9_999_999, undefined)).toBeNull();
  });
});

describe('why the API refused a file, in words a collector understands', () => {
  it('too large (413), with the limit of its source', () => {
    expect(
      importRefusal(
        refusal(413, 'PAYLOAD_TOO_LARGE', { reason: 'TOO_LARGE', fileLimit: 102_400 }),
        'YDK'
      )
    ).toEqual({ title: 'This file is too large', message: 'A deck file can be up to 100 kB.' });
    expect(importRefusal(refusal(413, 'PAYLOAD_TOO_LARGE'), 'YDK').message).toBe(
      'This file is larger than a deck file may be.'
    );
  });

  it('not a text file (415)', () => {
    expect(
      importRefusal(refusal(415, 'UNSUPPORTED_MEDIA_TYPE', { reason: 'NOT_TEXT' }), 'YDK')
    ).toEqual({
      title: 'This is not a text file',
      message:
        'A deck file is plain text: choose the .ydk file itself, not a picture or a compressed folder.',
    });
    expect(
      importRefusal(refusal(415, 'UNSUPPORTED_MEDIA_TYPE', { reason: 'NOT_TEXT' }), 'COLLECTR_CSV')
        .message
    ).toMatch(/choose the \.csv file itself, not a spreadsheet saved as \.xlsx/);
  });

  it('too many lines or rows, with the limit', () => {
    expect(
      importRefusal(
        refusal(400, 'VALIDATION_FAILED', { reason: 'TOO_MANY_LINES', fileLimit: 500 }),
        'YDK'
      )
    ).toEqual({
      title: 'This file has too many lines',
      message: 'A deck file can have up to 500 lines.',
    });
    expect(
      importRefusal(
        refusal(400, 'VALIDATION_FAILED', { reason: 'TOO_MANY_ROWS', fileLimit: 5000 }),
        'COLLECTR_CSV'
      ).message
    ).toBe('A CSV export can have up to 5,000 rows. Export your collection in smaller parts.');
  });

  it('a column that could not be found, by its name', () => {
    const found = importRefusal(
      refusal(400, 'VALIDATION_FAILED', {
        reason: 'MISSING_COLUMNS',
        missingColumns: ['card name'],
      }),
      'COLLECTR_CSV'
    );
    expect(found.title).toBe('A column could not be found');
    expect(found.message).toBe(
      'This file has no “card name” column. The first line of the file must name its columns: the card name is found under “Product Name”, “Card Name” or “Name”.'
    );
    expect(
      importRefusal(
        refusal(400, 'VALIDATION_FAILED', { reason: 'MISSING_COLUMNS' }),
        'COLLECTR_CSV'
      ).message
    ).toMatch(/^This file lacks a column the import needs\./);
  });

  it('an empty file, a file without a card, a CSV that cannot be read', () => {
    expect(
      importRefusal(refusal(400, 'VALIDATION_FAILED', { reason: 'EMPTY_FILE' }), 'YDK')
    ).toEqual({ title: 'This file is empty', message: 'Choose a deck file that lists cards.' });
    expect(
      importRefusal(refusal(400, 'VALIDATION_FAILED', { reason: 'NO_CARDS' }), 'YDK').message
    ).toMatch(/one card passcode per line under “#main”, “#extra” and “!side”/);
    expect(
      importRefusal(refusal(400, 'VALIDATION_FAILED', { reason: 'NO_CARDS' }), 'COLLECTR_CSV')
        .message
    ).toBe('This export has column titles but no row with a card name.');
    expect(
      importRefusal(refusal(400, 'VALIDATION_FAILED', { reason: 'MALFORMED' }), 'COLLECTR_CSV')
        .title
    ).toBe('This file could not be read');
  });

  it('too many imports in a short time, with when to try again', () => {
    expect(importRefusal(refusal(429, 'RATE_LIMITED', { retryAfterSeconds: 45 }), 'YDK')).toEqual({
      title: 'Too many imports in a short time',
      message: 'You can import again in 45 seconds.',
    });
    expect(
      importRefusal(refusal(429, 'RATE_LIMITED', { retryAfterSeconds: 1500 }), 'YDK').message
    ).toBe('You can import again in 25 minutes.');
    expect(importRefusal(refusal(429, 'RATE_LIMITED'), 'YDK').message).toBe(
      'You can import again in a moment.'
    );
  });

  it('anything else gets the usual wording (offline, a server failure)', () => {
    expect(importRefusal(ApiError.network(new Error('offline')), 'YDK').title).toBe(
      'You seem to be offline'
    );
    expect(importRefusal(refusal(500, 'INTERNAL_ERROR'), 'YDK').title).toBe(
      'Something went wrong on our side'
    );
  });
});

describe('the counts on top of a preview', () => {
  it('new cards, cards added to ones already owned, to choose, not recognised', () => {
    expect(summaryStats(summaryOf())).toEqual([
      { key: 'new', value: 1, label: 'new card', tone: 'default' },
      { key: 'merged', value: 0, label: 'added to cards you own', tone: 'default' },
      { key: 'choose', value: 2, label: 'need a printing', tone: 'attention' },
      { key: 'unmatched', value: 1, label: 'not recognised', tone: 'attention' },
    ]);
    const merged = summaryStats(summaryOf({ items: 5, mergedItems: 1, toChoose: 1, unmatched: 0 }));
    expect(merged.map((stat) => `${stat.value} ${stat.label}`)).toEqual([
      '4 new cards',
      '1 added to a card you own',
      '1 needs a printing',
      '0 not recognised',
    ]);
    expect(merged[3]?.tone).toBe('default');
    expect(newItems({ items: 2, mergedItems: 5 })).toBe(0);
  });

  it('says the copies, the lines that go in, what was left out and what was skipped', () => {
    expect(summarySentence(importFixture())).toBe('2 copies from 1 of the 4 lines of your file.');
    expect(
      summarySentence(
        importFixture({
          ignoredLines: 2,
          summary: summaryOf({ rows: 1200, ready: 1100, copies: 2345, leftOut: 3 }),
        })
      )
    ).toBe(
      '2,345 copies from 1,100 of the 1,200 lines of your file. 3 left out. 2 lines of the file were not cards and were skipped.'
    );
    expect(
      summarySentence(
        importFixture({ ignoredLines: 1, summary: summaryOf({ rows: 1, ready: 1, copies: 1 }) })
      )
    ).toBe(
      '1 copy from 1 of the 1 line of your file. 1 line of the file was not a card and was skipped.'
    );
  });

  it('shows the three sections of a deck with the cards the file holds in each', () => {
    expect(
      sectionSwitches({
        includeMain: true,
        includeExtra: true,
        includeSide: false,
        mainCopies: 40,
        extraCopies: 1,
        sideCopies: 0,
      })
    ).toEqual([
      { key: 'includeMain', label: 'Main deck', help: '40 cards in your file', value: true },
      { key: 'includeExtra', label: 'Extra deck', help: '1 card in your file', value: true },
      { key: 'includeSide', label: 'Side deck', help: 'None in your file', value: false },
    ]);
  });

  it('labels the filter with its counts', () => {
    expect(filterOptions(summaryOf())).toEqual([
      { value: 'ALL', label: 'All (4)' },
      { value: 'CHOOSE_PRINTING', label: 'Needs a printing (2)' },
      { value: 'UNMATCHED', label: 'Not recognised (1)' },
    ]);
    expect(emptyFilterText('CHOOSE_PRINTING').title).toBe('No card needs a printing');
    expect(emptyFilterText('UNMATCHED').title).toBe('Every line was recognised');
    expect(emptyFilterText('ALL').title).toBe('No lines');
  });

  it('knows a preview that expired from one that is committed', () => {
    const preview = importFixture({ expiresAt: '2026-10-13T13:00:00Z' });
    expect(isExpired(preview, Date.parse('2026-10-13T12:59:59Z'))).toBe(false);
    expect(isExpired(preview, Date.parse('2026-10-13T13:00:00Z'))).toBe(true);
    // After a commit `expiresAt` is until when the result stays readable: never "expired".
    expect(isExpired({ ...preview, status: 'COMMITTED' }, Date.parse('2026-10-14T00:00:00Z'))).toBe(
      false
    );
    expect(isImportGone(refusal(410, 'IMPORT_EXPIRED'))).toBe(true);
    expect(isImportGone(refusal(404, 'NOT_FOUND'))).toBe(true);
    expect(isImportGone(refusal(409, 'IMPORT_ALREADY_COMMITTED'))).toBe(false);
    expect(isImportGone(null)).toBe(false);
  });
});

describe('one line of a preview', () => {
  it('a recognised line: the card, its copy, its condition, its copies', () => {
    const row = rowFixture();
    expect(rowTitle(row)).toBe('Fixture Lantern Wisp');
    expect(rowCopyLabel(row)).toBe('YDKF-EN001 · Rare · YDK Fixtures');
    expect(rowConditionText(row)).toBe('Damaged (not in your file)');
    expect(rowConditionText({ condition: 'NEAR_MINT', conditionSource: 'FILE' })).toBe('Near Mint');
    expect(rowConditionText({ condition: 'NEAR_MINT', conditionSource: 'EDITED' })).toBe(
      'Near Mint'
    );
    expect(deckText(row.deck)).toBe('Main 2');
    expect(deckText({ main: 1, extra: 2, side: 3 })).toBe('Main 1 · Extra 2 · Side 3');
    expect(deckText(undefined)).toBeNull();
    expect(rowSummary(row)).toBe(
      'Fixture Lantern Wisp, YDKF-EN001 · Rare · YDK Fixtures, Damaged (not in your file), 2 copies'
    );
  });

  it('a line that needs a printing says so', () => {
    const row = chooseRow();
    expect(rowCopyLabel(row)).toBe('Choose printing');
    expect(rowSummary(row)).toBe(
      'Fixture Clockwork Heron, Choose printing, Damaged (not in your file), 2 copies'
    );
  });

  it('a line that goes into a card already owned says how many are held and added', () => {
    expect(ownedText({ ownedQuantity: 2, quantity: 3 })).toBe('You have 2: this adds 3.');
    expect(ownedText({ ownedQuantity: 0, quantity: 3 })).toBeNull();
  });

  it('a line that does not go in says why', () => {
    expect(rowStateText({ status: 'READY', included: false, inScope: true })).toBe('Left out');
    expect(rowStateText({ status: 'READY', included: true, inScope: false })).toBe(
      'Its deck section is switched off'
    );
    expect(rowStateText({ status: 'READY', included: true, inScope: true })).toBeNull();
    expect(rowStateText({ status: 'UNMATCHED', included: true, inScope: true })).toBeNull();
  });

  it('a line nothing fits: what the file said, as written, and why', () => {
    const passcode = unmatchedRow();
    expect(rowTitle(passcode)).toBe('Passcode 919999999');
    expect(rowSourceText(passcode)).toBe('1 copy');
    expect(unmatchedReasonText('UNKNOWN_PASSCODE')).toBe(
      'No card of the catalog has this passcode.'
    );
    const sheet = unmatchedRow({
      unmatchedReason: 'UNKNOWN_CARD',
      deck: undefined,
      source: {
        passcode: null,
        name: 'Nobody Knows Me',
        set: 'Some Set',
        number: 'EN404',
        rarity: 'Common',
      },
      fileQuantity: 3,
    });
    expect(rowTitle(sheet)).toBe('Nobody Knows Me');
    expect(rowSourceText(sheet)).toBe('Some Set · EN404 · Common · 3 copies');
    expect(rowSummary(sheet)).toBe(
      'Not recognised: Nobody Knows Me, Some Set · EN404 · Common · 3 copies, No card of the catalog has this name.'
    );
    for (const reason of [
      'AMBIGUOUS_CARD',
      'UNKNOWN_GAME',
      'NO_PRINTING',
      'INVALID_QUANTITY',
      'CARD_REMOVED',
    ] as const) {
      expect(unmatchedReasonText(reason)).toMatch(/\.$/);
    }
    expect(unmatchedReasonText(null)).toBe('Nothing in the catalog fits.');
  });

  it('lists the printings that fit the file first', () => {
    const { suggested, others } = orderedPrintings(HERON_PRINTINGS, [HERON_REPRINT]);
    expect(suggested.map((printing) => printing.printingCode)).toEqual(['YDKR-EN002']);
    expect(others.map((printing) => printing.printingCode)).toEqual(['YDKF-EN002']);
    expect(orderedPrintings(HERON_PRINTINGS, []).suggested).toEqual([]);
  });

  it('sends only what changed of the condition and the copies', () => {
    const row = rowFixture();
    expect(rowPatch(row, { condition: 'DAMAGED', quantity: 2 })).toEqual({});
    expect(rowPatch(row, { condition: 'NEAR_MINT', quantity: 2 })).toEqual({
      condition: 'NEAR_MINT',
    });
    expect(rowPatch(row, { condition: 'DAMAGED', quantity: 3 })).toEqual({ quantity: 3 });
    // A CSV line typed back to what the file says follows the file again.
    const sheet = rowFixture({
      deck: undefined,
      quantity: 5,
      fileQuantity: 2,
      quantityEdited: true,
    });
    expect(rowPatch(sheet, { condition: 'DAMAGED', quantity: 2 })).toEqual({ quantity: null });
    expect(quantityError('0')).toBe('At least 1 copy.');
    expect(quantityError('')).toBe('At least 1 copy.');
    expect(quantityError('10000')).toBe('At most 9,999 copies.');
    expect(quantityError('9999')).toBeNull();
  });
});

describe('the commit button says what a press does', () => {
  it('is disabled with its reason while cards still need a printing', () => {
    expect(commitState(summaryOf(), false)).toEqual({
      label: 'Add 1 card to my inventory',
      disabled: true,
      reason: '2 cards still need a printing. Choose them, or leave those cards out.',
    });
    expect(commitState(summaryOf({ toChoose: 1 }), false).reason).toBe(
      '1 card still needs a printing. Choose it, or leave that card out.'
    );
  });

  it('leaves them out only when the collector said so, and says it', () => {
    expect(commitState(summaryOf(), true)).toEqual({
      label: 'Add 1 card, leave 2 out',
      disabled: false,
      reason: 'It starts private: nobody sees it until you publish it.',
    });
    expect(leaveOutLabel(2)).toBe('Leave out the 2 cards that still need a printing');
    expect(leaveOutLabel(1)).toBe('Leave out the 1 card that still needs a printing');
  });

  it('adds every ready card once nothing is left to choose', () => {
    expect(commitState(summaryOf({ toChoose: 0, items: 3, ready: 3 }), false)).toEqual({
      label: 'Add 3 cards to my inventory',
      disabled: false,
      reason: 'They start private: nobody sees them until you publish them.',
    });
    expect(commitState(summaryOf({ toChoose: 0, items: 3, mergedItems: 1 }), false).reason).toBe(
      'New cards start private. 1 of them is added to a card you already have.'
    );
    expect(commitState(summaryOf({ toChoose: 0, items: 3, mergedItems: 2 }), false).reason).toBe(
      'New cards start private. 2 of them are added to cards you already have.'
    );
    expect(commitState(summaryOf({ toChoose: 0, items: 1, mergedItems: 1 }), false).reason).toBe(
      'Its copies are added to a card you already have.'
    );
    expect(commitState(summaryOf({ toChoose: 0, items: 2, mergedItems: 2 }), false).reason).toBe(
      'Their copies are added to cards you already have.'
    );
  });

  it('is disabled when nothing is ready', () => {
    expect(commitState(summaryOf({ toChoose: 0, items: 0, ready: 0 }), false)).toEqual({
      label: 'Add to my inventory',
      disabled: true,
      reason: 'No card of this file is ready to be added.',
    });
    expect(commitState(summaryOf({ toChoose: 2, items: 0, ready: 0 }), true).reason).toBe(
      'No card is ready: every card that was recognised still needs a printing.'
    );
  });

  it('words what the bulk actions did', () => {
    expect(mostRecentMessage(2)).toBe('2 cards got their most recent printing.');
    expect(mostRecentMessage(1)).toBe('1 card got its most recent printing.');
    expect(mostRecentMessage(0)).toBe('No card was waiting for a printing.');
    expect(conditionSetMessage(3, 'NEAR_MINT')).toBe('3 cards set to Near Mint.');
    expect(conditionSetMessage(0, 'NEAR_MINT')).toBe('Those cards are already Near Mint.');
  });
});

describe('the result of a commit', () => {
  const done = importFixture({
    status: 'COMMITTED',
    summary: summaryOf({ rows: 6, ready: 3, toChoose: 1, unmatched: 1, leftOut: 1 }),
    result: {
      itemsCreated: 2,
      itemsMerged: 1,
      copiesAdded: 5,
      rowsImported: 3,
      chunksDone: 1,
      totalChunks: 1,
    },
  });

  it('added, merged and left out, with why', () => {
    expect(linesLeftOut(done)).toBe(3);
    expect(resultLines(done)).toEqual([
      { key: 'added', value: 2, label: 'new cards added' },
      { key: 'merged', value: 1, label: 'card you already had got more copies' },
      {
        key: 'leftOut',
        value: 3,
        label: 'lines of your file left out',
        detail: '1 not recognised, 1 without a printing, 1 left out by you',
      },
    ]);
    expect(resultSentence(done.result)).toBe(
      '5 copies in all. New cards are private: publish them from your inventory when you are ready.'
    );
  });

  it('a commit that was cut says what is in and that it can be finished', () => {
    expect(
      interruptedText({
        itemsCreated: 500,
        itemsMerged: 0,
        copiesAdded: 500,
        rowsImported: 1200,
        chunksDone: 1,
        totalChunks: 3,
      })
    ).toBe(
      'Part 1 of 3 is in your inventory. Finish the import to add the rest: nothing is added twice.'
    );
    expect(interruptedText(null)).toMatch(/^Part of this import is in your inventory\./);
  });
});

describe('the import a collector left open', () => {
  const now = Date.parse('2026-10-13T12:30:00Z');

  it('is the preview that has not expired, or a commit to finish', () => {
    const pending = importFixture({ expiresAt: '2026-10-13T13:00:00Z' });
    const done = importFixture({ id: 'done', status: 'COMMITTED' });
    expect(openImport([done, pending], now)).toBe(pending);
    expect(openImport([done], now)).toBeNull();
    expect(openImport([importFixture({ expiresAt: '2026-10-13T12:00:00Z' })], now)).toBeNull();
    const cut = importFixture({ id: 'cut', status: 'COMMITTING' });
    expect(openImport([cut, pending], now)).toBe(cut);
    expect(openImport(undefined, now)).toBeNull();
  });

  it('is named by its source, its lines and until when it is kept', () => {
    expect(openImportText(importFixture())).toMatch(/^Deck file · 4 lines · kept until \S+/);
    expect(openImportText(importFixture({ source: 'COLLECTR_CSV', status: 'COMMITTING' }))).toBe(
      'CSV export · 4 lines'
    );
  });
});
