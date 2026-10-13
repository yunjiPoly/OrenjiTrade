import type {
  ImportLimits,
  ImportRow,
  ImportRowPage,
  ImportSummary,
  InventoryImport,
} from '@/src/api/types';

import { printingFixture } from './fixtures';

/**
 * Fixtures of the inventory import (stage S5), fictional like every other: the worked example of
 * `docs/api/contracts/s5-inventory-import.md` (a deck of four lines: one card ready, the same card
 * twice to choose, one unknown passcode).
 */
export const IMPORT_ID = '00000000-0000-4000-9d00-000000000001';
export const WISP_CARD = '00000000-0000-4000-9d10-000000000001';
export const HERON_CARD = '00000000-0000-4000-9d10-000000000002';
export const WISP_PRINTING = '00000000-0000-4000-9d20-000000000001';
export const HERON_FIRST = '00000000-0000-4000-9d20-000000000002';
export const HERON_REPRINT = '00000000-0000-4000-9d20-000000000003';

export const IMPORT_LIMITS: ImportLimits = {
  ydkMaxBytes: 102_400,
  ydkMaxLines: 500,
  csvMaxBytes: 2_097_152,
  csvMaxRows: 5_000,
  previewTtlMinutes: 60,
};

export function summaryOf(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    rows: 4,
    ready: 1,
    toChoose: 2,
    unmatched: 1,
    leftOut: 0,
    copies: 2,
    items: 1,
    mergedItems: 0,
    defaultConditions: 3,
    ...overrides,
  };
}

/** A preview that expires far in the future unless a test says otherwise. */
export function importFixture(overrides: Partial<InventoryImport> = {}): InventoryImport {
  return {
    id: IMPORT_ID,
    source: 'YDK',
    status: 'PENDING',
    createdAt: '2026-10-13T12:00:00Z',
    expiresAt: '2099-01-01T13:00:00Z',
    committedAt: null,
    sections: {
      includeMain: true,
      includeExtra: true,
      includeSide: true,
      mainCopies: 3,
      extraCopies: 1,
      sideCopies: 2,
    },
    ignoredLines: 0,
    summary: summaryOf(),
    result: null as unknown as InventoryImport['result'],
    ...overrides,
  };
}

export const WISP_PRINTING_SUMMARY = printingFixture({
  id: WISP_PRINTING,
  cardId: WISP_CARD,
  setCode: 'YDKF',
  setName: 'YDK Fixtures',
  collectorNumber: 'EN001',
  printingCode: 'YDKF-EN001',
  rarity: 'Rare',
  finish: 'NORMAL',
  marketPrice: undefined,
});

export const HERON_PRINTINGS = [
  printingFixture({
    id: HERON_FIRST,
    cardId: HERON_CARD,
    setCode: 'YDKF',
    setName: 'YDK Fixtures',
    collectorNumber: 'EN002',
    printingCode: 'YDKF-EN002',
    rarity: 'Rare',
    finish: 'NORMAL',
    marketPrice: undefined,
  }),
  printingFixture({
    id: HERON_REPRINT,
    cardId: HERON_CARD,
    setCode: 'YDKR',
    setName: 'YDK Fixtures Reprint',
    collectorNumber: 'EN002',
    printingCode: 'YDKR-EN002',
    rarity: 'Ultra Rare',
    finish: 'NORMAL',
    marketPrice: undefined,
  }),
];

export function rowFixture(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    id: 'row-0',
    position: 0,
    status: 'READY',
    unmatchedReason: null,
    source: { passcode: '910000001', name: null, set: null, number: null, rarity: null },
    deck: { main: 2, extra: 0, side: 0 },
    card: {
      id: WISP_CARD,
      name: 'Fixture Lantern Wisp',
      game: 'yugioh',
      imageUrl: '/api/v1/public/card-images/wisp',
    },
    printing: WISP_PRINTING_SUMMARY,
    printingChoice: 'AUTO',
    printingCount: 1,
    suggestedPrintingIds: [],
    condition: 'DAMAGED',
    conditionSource: 'DEFAULT',
    language: 'en',
    edition: 'UNLIMITED',
    quantity: 2,
    fileQuantity: 2,
    quantityEdited: false,
    included: true,
    inScope: true,
    willImport: true,
    ownedQuantity: 0,
    ...overrides,
  };
}

/** A line that still needs its printing (the Heron). */
export function chooseRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return rowFixture({
    id: 'row-1',
    position: 1,
    status: 'CHOOSE_PRINTING',
    source: { passcode: '910000002', name: null, set: null, number: null, rarity: null },
    deck: { main: 1, extra: 0, side: 1 },
    card: {
      id: HERON_CARD,
      name: 'Fixture Clockwork Heron',
      game: 'yugioh',
      imageUrl: '/api/v1/public/card-images/heron',
    },
    printing: undefined,
    printingChoice: null,
    printingCount: 2,
    language: null,
    edition: null,
    quantity: 2,
    fileQuantity: 2,
    willImport: false,
    ...overrides,
  });
}

/** A line nothing fits (an unknown passcode). */
export function unmatchedRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return rowFixture({
    id: 'row-3',
    position: 3,
    status: 'UNMATCHED',
    unmatchedReason: 'UNKNOWN_PASSCODE',
    source: { passcode: '919999999', name: null, set: null, number: null, rarity: null },
    deck: { main: 0, extra: 0, side: 1 },
    card: undefined,
    printing: undefined,
    printingChoice: null,
    printingCount: 0,
    condition: null,
    language: null,
    edition: null,
    quantity: 1,
    fileQuantity: 1,
    willImport: false,
    ...overrides,
  });
}

/** The four lines of the worked example. */
export function deckRows(): ImportRow[] {
  return [
    rowFixture(),
    chooseRow(),
    chooseRow({ id: 'row-2', position: 2, deck: { main: 0, extra: 1, side: 0 }, quantity: 1 }),
    unmatchedRow(),
  ];
}

export function rowPage(
  items: ImportRow[],
  page = 0,
  totalPages = 1,
  totalItems?: number
): ImportRowPage {
  return { items, page, size: 50, totalItems: totalItems ?? items.length, totalPages };
}
