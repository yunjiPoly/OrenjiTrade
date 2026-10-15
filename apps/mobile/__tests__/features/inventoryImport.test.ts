import { ApiError } from '@/src/api/ApiError';
import { quantityError, rowPatch } from '@/src/features/inventory/import/ImportRowEditDialog';
import { openImport } from '@/src/features/inventory/import/ImportStart';
import {
  IMPORT_SOURCES,
  assumedCopies,
  assumedCopiesText,
  assumedCopyText,
  cardsAndCopies,
  commitState,
  conditionSetMessage,
  deckText,
  defaultConditionsText,
  emptyFilterText,
  filterOptions,
  formatBytes,
  importRefusal,
  interruptedText,
  isExpired,
  lateEditText,
  leaveOutLabel,
  limitRefusalText,
  limitsHint,
  lineNoun,
  linesLeftOut,
  matchedSourceText,
  mostRecentMessage,
  needPrintingTitle,
  newItems,
  openImportText,
  orderedPrintings,
  ownedText,
  limitRoomText,
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
  unmatchedNextStep,
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
    // "Passcode" is a word of the game: said once, where the deck file is chosen.
    expect(IMPORT_SOURCES.YDK.description).toMatch(
      /the passcode of a card: the number printed in the lower left corner of the card/
    );
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
      title: 'This file could not be read as text',
      message:
        'A deck file is plain text: choose the .ydk file itself, not a picture or a compressed folder.',
    });
    const sheet = importRefusal(
      refusal(415, 'UNSUPPORTED_MEDIA_TYPE', { reason: 'NOT_TEXT' }),
      'COLLECTR_CSV'
    ).message;
    expect(sheet).toMatch(/Choose the \.csv file itself, not a spreadsheet saved as \.xlsx/);
    // A real .csv in another encoding is also refused as "not text": the sentence covers it.
    expect(sheet).toMatch(/a \.csv that another app saved again.*save it as “CSV UTF-8”/);
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
    ).toBe(
      'A deck file lists one passcode per line (the number printed in the lower left corner of a card) under “#main”, “#extra” and “!side”. This file has none.'
    );
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

  it('says what the file holds, what is ready, what was left out and what was skipped', () => {
    // A deck: its lines are one per different card, never "lines of the file".
    expect(summarySentence(importFixture())).toBe(
      'Your file lists 4 different cards. 1 is ready to add: 2 copies.'
    );
    expect(
      summarySentence(
        importFixture({
          source: 'COLLECTR_CSV',
          ignoredLines: 2,
          summary: summaryOf({ rows: 1200, ready: 1100, copies: 2345, leftOut: 3 }),
        })
      )
    ).toBe(
      'Your file has 1,200 lines. 1,100 are ready to add: 2,345 copies. 3 left out. 2 lines of the file were not cards and were skipped.'
    );
    expect(
      summarySentence(
        importFixture({ ignoredLines: 1, summary: summaryOf({ rows: 1, ready: 1, copies: 1 }) })
      )
    ).toBe(
      'Your file lists 1 different card. 1 is ready to add: 1 copy. 1 line of the file was not a card and was skipped.'
    );
    expect(summarySentence(importFixture({ summary: summaryOf({ ready: 0, copies: 0 }) }))).toBe(
      'Your file lists 4 different cards. None is ready to add yet.'
    );
  });

  it('has one word per thing: a card of the inventory, a copy, a line of the file', () => {
    expect(lineNoun('YDK')).toEqual({ one: 'different card', many: 'different cards' });
    expect(lineNoun('COLLECTR_CSV')).toEqual({ one: 'line', many: 'lines' });
    expect(needPrintingTitle(2, 'YDK')).toBe('2 cards need a printing');
    expect(needPrintingTitle(1, 'YDK')).toBe('1 card needs a printing');
    // A CSV is counted line by line: 115 lines can be fewer cards once equal lines are one.
    expect(needPrintingTitle(115, 'COLLECTR_CSV')).toBe('115 lines need a printing');
    expect(needPrintingTitle(1, 'COLLECTR_CSV')).toBe('1 line needs a printing');
    // The copies stand next to the cards whenever they are another number.
    expect(cardsAndCopies({ items: 12, copies: 40 })).toBe('12 cards (40 copies)');
    expect(cardsAndCopies({ items: 1, copies: 3 })).toBe('1 card (3 copies)');
    expect(cardsAndCopies({ items: 3, copies: 3 })).toBe('3 cards');
  });

  it('shows the three sections of a deck with the copies the file holds in each', () => {
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
      { key: 'includeMain', label: 'Main deck', help: '40 copies in your file', value: true },
      { key: 'includeExtra', label: 'Extra deck', help: '1 copy in your file', value: true },
      { key: 'includeSide', label: 'Side deck', help: 'None in your file', value: false },
    ]);
  });

  it('labels the filter with its counts', () => {
    expect(filterOptions(summaryOf())).toEqual([
      { value: 'ALL', label: 'All (4)' },
      { value: 'CHOOSE_PRINTING', label: 'Needs a printing (2)' },
      { value: 'UNMATCHED', label: 'Not recognised (1)' },
    ]);
    expect(emptyFilterText('CHOOSE_PRINTING').title).toBe('Nothing needs a printing');
    expect(emptyFilterText('UNMATCHED').title).toBe('Everything was recognised');
    expect(emptyFilterText('ALL').title).toBe('Nothing to show');
  });

  it('keeps a filter for the lines whose copy was assumed, for as long as there are any', () => {
    // Nothing was assumed: no such chip.
    expect(filterOptions(summaryOf()).map((option) => option.value)).not.toContain(
      'MOST_RECENT_ASSUMED'
    );
    // 115 of 435 lines got the plain copy: they are counted and one press away.
    const long = summaryOf({ rows: 435, toChoose: 0, unmatched: 15, assumedPrintings: 115 });
    // What asks something of the collector comes before what can only be read.
    expect(filterOptions(long)).toEqual([
      { value: 'ALL', label: 'All (435)' },
      { value: 'CHOOSE_PRINTING', label: 'Needs a printing (0)' },
      // The third chip of a pinned row is cut at the screen's edge: its count leads, so the
      // count is the part in view, and a screen reader hears the words on screen, then what
      // they mean (a deck counts in cards).
      {
        value: 'MOST_RECENT_ASSUMED',
        label: '115 assumed',
        accessibilityLabel: '115 assumed: the cards whose plain copy was assumed',
      },
      { value: 'UNMATCHED', label: 'Not recognised (15)' },
    ]);
    expect(
      filterOptions({ ...long, assumedPrintings: 1234 }).find(
        (option) => option.value === 'MOST_RECENT_ASSUMED'
      )?.label
    ).toBe('1,234 assumed');
    // The last one was checked while its list is shown: the chip stays, and the list says so.
    expect(filterOptions(summaryOf(), 'MOST_RECENT_ASSUMED')[2]).toEqual({
      value: 'MOST_RECENT_ASSUMED',
      label: '0 assumed',
      accessibilityLabel: '0 assumed: the cards whose plain copy was assumed',
    });
    // A CSV counts in lines, and one is one.
    expect(
      filterOptions({ ...long, assumedPrintings: 1 }, 'ALL', 'COLLECTR_CSV')[2]?.accessibilityLabel
    ).toBe('1 assumed: the line whose plain copy was assumed');
    expect(filterOptions(long, 'ALL', 'COLLECTR_CSV')[2]?.accessibilityLabel).toBe(
      '115 assumed: the lines whose plain copy was assumed'
    );
    // Label in name (WCAG 2.5.3): whatever a chip shows starts the name a screen reader and
    // Voice Control use, so "Tap 115 assumed" reaches it.
    for (const source of ['YDK', 'COLLECTR_CSV'] as const) {
      for (const assumedPrintings of [0, 1, 115, 1234]) {
        for (const option of filterOptions(
          { ...long, assumedPrintings },
          'MOST_RECENT_ASSUMED',
          source
        )) {
          expect((option.accessibilityLabel ?? option.label).startsWith(option.label)).toBe(true);
        }
      }
    }
    expect(emptyFilterText('MOST_RECENT_ASSUMED')).toEqual({
      title: 'No plain copy left to check',
      description: 'Every copy that was taken for you has been confirmed or changed.',
    });
    // An answer cached before the API counted them.
    const old = { ...summaryOf(), assumedPrintings: undefined as unknown as number };
    expect(assumedCopies(old)).toBe(0);
    expect(filterOptions(old)).toHaveLength(3);
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
    expect(ownedText({ ownedQuantity: 2, shownQuantity: 0, quantity: 3 })).toBe(
      'You have 2: this adds 3.'
    );
    expect(ownedText({ ownedQuantity: 0, shownQuantity: 0, quantity: 3 })).toBeNull();
  });

  it('a card the collector shows is never raised by an import, and the line says so', () => {
    expect(ownedText({ ownedQuantity: 0, shownQuantity: 1, quantity: 2 })).toBe(
      'You show 1 publicly: that card stays as it is, and these 2 copies are added as a private card.'
    );
    expect(ownedText({ ownedQuantity: 0, shownQuantity: 3, quantity: 1 })).toBe(
      'You show 3 publicly: that card stays as it is, and this copy is added as a private card.'
    );
    // A private card and a public one: the copies join the private one.
    expect(ownedText({ ownedQuantity: 2, shownQuantity: 1, quantity: 3 })).toBe(
      'You have 2: this adds 3. The 1 you show publicly stays as it is.'
    );
    expect(ownedText({ ownedQuantity: 2, shownQuantity: 4, quantity: 3 })).toBe(
      'You have 2: this adds 3. The 4 you show publicly stay as they are.'
    );
  });

  it('a recognised line shows what the file said, so the match can be checked', () => {
    // A deck: the passcode. Two lines of one card are the card and its alternate artwork.
    expect(matchedSourceText(rowFixture())).toBe('Passcode 910000001');
    expect(
      matchedSourceText(
        chooseRow({
          source: { passcode: '910000003', name: null, set: null, number: null, rarity: null },
        })
      )
    ).toBe('Passcode 910000003');
    // A CSV: the set, number and rarity as written; the name only when it is spelled otherwise.
    const sheet = rowFixture({
      deck: undefined,
      source: {
        passcode: null,
        name: 'fixture lantern wisp',
        set: 'YDK Fixtures',
        number: 'EN001',
        rarity: 'Rare',
      },
    });
    expect(matchedSourceText(sheet)).toBe('In your file: YDK Fixtures · EN001 · Rare');
    expect(
      matchedSourceText({ ...sheet, source: { ...sheet.source, name: 'Lantern Wisp (Alt Art)' } })
    ).toBe('In your file: Lantern Wisp (Alt Art) · YDK Fixtures · EN001 · Rare');
    expect(
      matchedSourceText({
        ...sheet,
        source: {
          passcode: null,
          name: 'Fixture Lantern Wisp',
          set: null,
          number: null,
          rarity: null,
        },
      })
    ).toBeNull();
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
    // The passcode is said for what it is, and the line says what can be done about it.
    expect(unmatchedReasonText('UNKNOWN_PASSCODE')).toBe(
      'No card of the catalog has this passcode (the number printed in the lower left corner of a card).'
    );
    expect(unmatchedNextStep('UNKNOWN_PASSCODE')).toBe(
      'If you know which card it is, find the card by its name with “Add card” in your inventory.'
    );
    // A deck line says in which sections the file holds it.
    expect(rowSummary(passcode)).toBe(
      'Not recognised: Passcode 919999999, 1 copy, Side 1, No card of the catalog has this passcode (the number printed in the lower left corner of a card)., If you know which card it is, find the card by its name with “Add card” in your inventory.'
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
    // A line of a game OrenjiTrade does not have is reported for its game, whatever its file
    // wrote for the copies: when that was no number of copies, the line says so where its copies
    // would stand (it showed nothing there, as if the file had said nothing).
    const otherGame = { ...sheet, unmatchedReason: 'UNKNOWN_GAME' as const, fileQuantity: 0 };
    expect(rowSourceText(otherGame)).toBe(
      'Some Set · EN404 · Common · copies: not a number from 1 to 9,999'
    );
    expect(rowSummary(otherGame)).toBe(
      'Not recognised: Nobody Knows Me, Some Set · EN404 · Common · copies: not a number from 1 to 9,999, OrenjiTrade does not have this game., Cards of this game cannot be added yet.'
    );
    expect(rowSourceText({ ...otherGame, fileQuantity: 4 })).toBe(
      'Some Set · EN404 · Common · 4 copies'
    );
    // Where the copies are the very reason, the sentence under the line says it, once.
    const badCopies = { ...sheet, unmatchedReason: 'INVALID_QUANTITY' as const, fileQuantity: 0 };
    expect(rowSourceText(badCopies)).toBe('Some Set · EN404 · Common');
    expect(unmatchedReasonText('INVALID_QUANTITY')).toBe(
      'The number of copies in the file is not a whole number from 1 to 9,999.'
    );
    expect(rowSummary(sheet)).toBe(
      'Not recognised: Nobody Knows Me, Some Set · EN404 · Common · 3 copies, No card of the catalog has this name., Check its spelling in your file, or find the card by its name with “Add card” in your inventory.'
    );
    for (const reason of [
      'AMBIGUOUS_CARD',
      'UNKNOWN_GAME',
      'NO_PRINTING',
      'INVALID_QUANTITY',
      'CARD_REMOVED',
    ] as const) {
      expect(unmatchedReasonText(reason)).toMatch(/\.$/);
      // Never a dead end: every reason comes with what happens next.
      expect(unmatchedNextStep(reason)).toMatch(/\.$/);
    }
    expect(unmatchedNextStep('AMBIGUOUS_CARD')).toMatch(/Add the set or the card number/);
    expect(unmatchedReasonText('INVALID_QUANTITY')).toBe(
      'The number of copies in the file is not a whole number from 1 to 9,999.'
    );
    expect(unmatchedReasonText(null)).toBe('Nothing in the catalog fits.');
    expect(unmatchedNextStep(null)).toMatch(/“Add card” in your inventory/);
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
      label: 'Add 1 card (2 copies) to my inventory',
      shortLabel: 'Add 1 card (2 copies)',
      disabled: true,
      reason: '2 cards still need a printing. Choose them, or leave them out.',
    });
    expect(commitState(summaryOf({ toChoose: 1 }), false).reason).toBe(
      '1 card still needs a printing. Choose it, or leave it out.'
    );
    // A CSV counts what still needs a printing in lines.
    expect(commitState(summaryOf({ toChoose: 115 }), false, 'COLLECTR_CSV').reason).toBe(
      '115 lines still need a printing. Choose them, or leave them out.'
    );
  });

  it('leaves them out only when the collector said so, and says it', () => {
    expect(commitState(summaryOf(), true)).toEqual({
      label: 'Add 1 card, leave 2 out (2 copies added)',
      shortLabel: 'Add 1 card, leave 2 out',
      disabled: false,
      reason: 'It starts private: nobody sees it until you publish it.',
    });
    expect(leaveOutLabel(2)).toBe('Leave out the 2 cards that still need a printing');
    expect(leaveOutLabel(1)).toBe('Leave out the 1 card that still needs a printing');
    expect(leaveOutLabel(115, 'COLLECTR_CSV')).toBe(
      'Leave out the 115 lines that still need a printing'
    );
  });

  it('adds every ready card once nothing is left to choose', () => {
    expect(commitState(summaryOf({ toChoose: 0, items: 3, ready: 3, copies: 3 }), false)).toEqual({
      label: 'Add 3 cards to my inventory',
      shortLabel: 'Add 3 cards to my inventory',
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

  it('shows a label that fits one line of a phone, and keeps the whole sentence as its name', () => {
    // The file of the review: the cards, their copies and "to my inventory" together are wider
    // than the button, and the label broke onto a second line.
    const csv = commitState(
      summaryOf({ toChoose: 0, items: 434, ready: 434, copies: 1266 }),
      false,
      'COLLECTR_CSV'
    );
    expect(csv.label).toBe('Add 434 cards (1,266 copies) to my inventory');
    expect(csv.shortLabel).toBe('Add 434 cards (1,266 copies)');
    // A press that leaves lines out names the cards and how many lines stay out.
    const leaving = commitState(
      summaryOf({ toChoose: 12, items: 434, ready: 434, copies: 1266 }),
      true,
      'COLLECTR_CSV'
    );
    expect(leaving.label).toBe('Add 434 cards, leave 12 out (1,266 copies added)');
    expect(leaving.shortLabel).toBe('Add 434 cards, leave 12 out');
    // Where the copies are the cards, there is nothing to add to what the button shows.
    expect(
      commitState(summaryOf({ toChoose: 12, items: 434, ready: 434, copies: 434 }), true).label
    ).toBe('Add 434 cards, leave 12 out');
    // No visible label is longer than the longest one that fits ("Add 1,234 cards to my
    // inventory", 31 characters), whatever the counts.
    for (const summary of [
      summaryOf({ toChoose: 0, items: 1234, ready: 1234, copies: 9999 }),
      summaryOf({ toChoose: 0, items: 1234, ready: 1234, copies: 1234 }),
      summaryOf({ toChoose: 115, items: 1234, ready: 1234, copies: 9999 }),
      summaryOf({ toChoose: 0, items: 0, ready: 0 }),
    ]) {
      for (const leaveOut of [false, true]) {
        const state = commitState(summary, leaveOut, 'COLLECTR_CSV');
        expect(state.shortLabel.length).toBeLessThanOrEqual(31);
        // Label in name (WCAG 2.5.3): the name starts with what the button shows.
        expect(state.label.startsWith(state.shortLabel)).toBe(true);
      }
    }
  });

  it('is disabled when nothing is ready', () => {
    expect(commitState(summaryOf({ toChoose: 0, items: 0, ready: 0 }), false)).toEqual({
      label: 'Add to my inventory',
      shortLabel: 'Add to my inventory',
      disabled: true,
      reason: 'No card of this file is ready to be added.',
    });
    expect(commitState(summaryOf({ toChoose: 2, items: 0, ready: 0 }), true).reason).toBe(
      'No card is ready: everything that was recognised still needs a printing.'
    );
  });

  it('words what the bulk actions did', () => {
    expect(mostRecentMessage(2)).toBe('2 cards got their most recent printing.');
    expect(mostRecentMessage(1)).toBe('1 card got its most recent printing.');
    expect(mostRecentMessage(0)).toBe('Nothing was waiting for a printing.');
    expect(conditionSetMessage(3, 'NEAR_MINT')).toBe('3 cards set to Near Mint.');
    expect(conditionSetMessage(0, 'NEAR_MINT')).toBe('Those cards are already Near Mint.');
  });

  it('says which lines got the plain copy of several versions, and which it could not decide', () => {
    // A 1st Edition and an Unlimited copy of one set: the release date decides nothing, the
    // plain copy is taken, and the collector is told to check.
    expect(mostRecentMessage(114, 5, 0, 'COLLECTR_CSV')).toBe(
      '114 lines got their most recent printing. For 5 of them that set has several versions: the plain copy (Unlimited, no foil) was taken. Check them.'
    );
    expect(mostRecentMessage(1, 1)).toBe(
      '1 card got its most recent printing. Its most recent set has several versions: the plain copy (Unlimited, no foil) was taken. Check it.'
    );
    expect(mostRecentMessage(2, 2)).toBe(
      '2 cards got their most recent printing. Their most recent set has several versions: the plain copy (Unlimited, no foil) was taken. Check them.'
    );
    // Two rarities, two languages: nothing is taken for the collector.
    expect(mostRecentMessage(112, 0, 2, 'COLLECTR_CSV')).toBe(
      '112 lines got their most recent printing. 2 lines have several printings in their most recent set: choose them.'
    );
    expect(mostRecentMessage(3, 1, 1)).toBe(
      '3 cards got their most recent printing. For 1 of them that set has several versions: the plain copy (Unlimited, no foil) was taken. Check it. 1 card has several printings in its most recent set: choose it.'
    );
    expect(mostRecentMessage(0, 0, 3)).toBe(
      '3 cards have several printings in their most recent set: choose them.'
    );
    // The line itself keeps saying that its copy was assumed.
    expect(assumedCopyText({ printingChoice: 'MOST_RECENT_ASSUMED' })).toBe(
      'Taken as the plain copy (Unlimited, no foil): its most recent set has other versions. Change it if yours is another.'
    );
    expect(assumedCopyText({ printingChoice: 'MOST_RECENT' })).toBeNull();
    expect(assumedCopyText({ printingChoice: 'MANUAL' })).toBeNull();
  });

  it('counts the lines whose copy was assumed on a card that stays, and says how to check one', () => {
    expect(assumedCopiesText(115, 'COLLECTR_CSV')).toEqual({
      title: 'Plain copy assumed for 115 lines',
      description:
        'Their most recent set has the card in several versions, so the plain copy (Unlimited, no foil) was taken. Check each one: open its copy and pick yours, or pick the plain copy again to confirm it.',
      action: 'Show these 115 lines',
    });
    expect(assumedCopiesText(1, 'COLLECTR_CSV')).toEqual({
      title: 'Plain copy assumed for 1 line',
      description:
        'Its most recent set has the card in several versions, so the plain copy (Unlimited, no foil) was taken. Check it: open its copy and pick yours, or pick the plain copy again to confirm it.',
      action: 'Show this line',
    });
    // A deck is counted in cards, as everywhere on its preview.
    expect(assumedCopiesText(2, 'YDK').title).toBe('Plain copy assumed for 2 cards');
    expect(assumedCopiesText(2, 'YDK').action).toBe('Show these 2 cards');
    expect(assumedCopiesText(1, 'YDK').action).toBe('Show this card');
  });

  it('says what the cards without a condition are set to, also after a bulk action', () => {
    const lowest = ['DAMAGED'];
    expect(defaultConditionsText(summaryOf({ defaultConditions: 2 }), lowest)).toEqual({
      description:
        'Your file does not say the condition of 2 cards. A card without one starts at the lowest grade (Damaged), so nothing promises more than the card is. Check the condition on each line, or set one for all of them.',
      action: 'Set one condition for these 2 cards',
    });
    // Once the collector set one for all of them, the card says that, not where they started.
    expect(
      defaultConditionsText(
        summaryOf({ defaultConditions: 2, defaultCondition: 'NEAR_MINT' }),
        lowest
      )
    ).toEqual({
      description:
        'Your file does not say the condition of 2 cards. You set them to Near Mint. Check the condition on each line, or change it for all of them.',
      action: 'Change the condition of these 2 cards',
    });
    expect(
      defaultConditionsText(summaryOf({ defaultConditions: 1, defaultCondition: 'MINT' }), lowest)
    ).toEqual({
      description:
        'Your file does not say the condition of 1 card. You set it to Mint. Check the condition on each line, or change it for all of them.',
      action: 'Change the condition of this card',
    });
    // Mixed (several games, or some lines changed since): nothing is claimed about a grade.
    expect(
      defaultConditionsText(summaryOf({ defaultConditions: 1, defaultCondition: null }), lowest)
    ).toEqual({
      description:
        'Your file does not say the condition of 1 card. A card without one starts at the lowest grade, so nothing promises more than the card is. Check the condition on each line, or set one for all of them.',
      action: 'Set the condition of this card',
    });
  });

  it('says before the commit when the inventory limit has no room, and what to do when refused', () => {
    const adds = summaryOf({ toChoose: 0, items: 3, mergedItems: 1 });
    expect(limitRoomText(adds, null)).toBeNull();
    expect(limitRoomText(adds, 2)).toBeNull();
    expect(limitRoomText(adds, 1)).toBe(
      'Your inventory has room for 1 more card and this import adds 2 new cards: leave 1 out. Copies added to cards you already have always fit.'
    );
    expect(limitRoomText(adds, 0)).toBe(
      'Your inventory has no room for a new card and this import adds 2 new cards: leave 2 out. Copies added to cards you already have always fit.'
    );
    // Lines that still need a printing may become new cards too: said as "up to".
    expect(limitRoomText(summaryOf({ toChoose: 2, items: 1, mergedItems: 0 }), 2)).toBe(
      'Your inventory has room for 2 more cards and this import can add up to 3 new cards: leave out what does not fit before you add it. Copies added to cards you already have always fit.'
    );
    expect(limitRefusalText({ limit: 6, used: 5, requested: 2 })).toBe(
      'This import adds 2 new cards and your inventory has room for 1 (5 of 6 used). Leave 1 out and try again.'
    );
    expect(limitRefusalText({ limit: 6, used: 6, requested: 1 })).toBe(
      'This import adds 1 new card and your inventory has room for 0 (6 of 6 used). Leave 1 out and try again.'
    );
    expect(limitRefusalText({ limit: null, used: 5, requested: 2 })).toBeNull();
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
      copiesNotAdded: 0,
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
        label: 'different cards of your file left out',
        detail: '1 not recognised, 1 without a printing, 1 left out by you',
      },
    ]);
    expect(resultLines({ ...done, source: 'COLLECTR_CSV' })[2]?.label).toBe(
      'lines of your file left out'
    );
    expect(resultSentence(done.result)).toBe(
      '5 copies in all. Everything this import added is private: publish it from your inventory when you are ready.'
    );
  });

  it('says the copies that were not added because a card holds at most 9,999', () => {
    expect(resultSentence({ ...done.result!, copiesAdded: 9, copiesNotAdded: 10_010 })).toBe(
      '9 copies in all. 10,010 copies were not added: a card holds at most 9,999 copies. Everything this import added is private: publish it from your inventory when you are ready.'
    );
    expect(resultSentence({ ...done.result!, copiesNotAdded: 1 })).toMatch(
      /1 copy was not added: a card holds at most 9,999 copies\./
    );
  });

  it('says when a change came after the import had been added', () => {
    expect(lateEditText(['Fixture Lantern Wisp'])).toBe(
      'This import was already added before your last change to Fixture Lantern Wisp was saved: that change is not in it. Check that card in your inventory.'
    );
    expect(lateEditText(['A', 'B', 'A'])).toBe(
      'This import was already added before your last change to A and B was saved: that change is not in it. Check those cards in your inventory.'
    );
    expect(lateEditText([])).toMatch(/before your last change was saved/);
  });

  it('a commit that was cut says what is in and that it can be finished', () => {
    expect(
      interruptedText({
        itemsCreated: 500,
        itemsMerged: 0,
        copiesAdded: 500,
        rowsImported: 1200,
        copiesNotAdded: 0,
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
    expect(openImportText(importFixture())).toMatch(
      /^Deck file · 4 different cards · kept until \S+/
    );
    expect(openImportText(importFixture({ source: 'COLLECTR_CSV', status: 'COMMITTING' }))).toBe(
      'CSV export · 4 lines'
    );
  });
});
