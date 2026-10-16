import { NAME_AREA, SET_CODE_AREA } from '@/src/features/scan/cardAreas';
import { areaRect } from '@/src/features/scan/CameraFrameOverlay';
import { fitCardFrame, FRAME_WIDTH_SHARE } from '@/src/features/scan/cameraLayout';
import { manyRaritiesText, raritiesCount, tileAnnouncement } from '@/src/features/scan/scanCopy';
import { matchRail, printingsOfCard, readText, rowRarity } from '@/src/features/scan/scanPrintings';
import {
  addPhoto,
  applyMatch,
  emptyScanSession,
  findTile,
  markWaiting,
  setCopies,
  type ScanTile,
} from '@/src/features/scan/scanSession';
import { tileTone } from '@/src/features/scan/ScanTileCard';
import { darkPalette } from '@/src/theme';

import {
  FOUND_YEW,
  FOX,
  FOX_BY_NAME,
  LYRA_OTHER,
  PICK_RARITY_LANTERN,
  READ_YEW,
  YEW,
  ZACR_036,
} from '../../support/scanFixtures';

/** Pure parts of the scan's screens (27 to 29): the frame's place, the rail of 28, the wording. */

function tileOf(match = FOUND_YEW): ScanTile {
  const { session, tileId } = addPhoto(emptyScanSession(), {
    uri: 'file:///cache/a.jpg',
    width: 3000,
    height: 4000,
    owned: true,
  });
  return findTile(applyMatch(session, tileId, match.read, match), tileId) as ScanTile;
}

describe("the camera's frame", () => {
  it('is as tall as its space allows, card-shaped, never wider than the mockup share', () => {
    const frame = fitCardFrame({ x: 0, y: 60, width: 390, height: 400 }, 390);
    expect(frame).not.toBeNull();
    const { x, y, width, height } = frame!;
    expect(width).toBeCloseTo(258, 0);
    expect(width / height).toBeCloseTo(59 / 86, 5);
    expect(x).toBeCloseTo((390 - width) / 2, 5);
    expect(y).toBeCloseTo(60 + (400 - height) / 2, 5);
  });

  it('shrinks to a short space (a small phone, large text) and keeps its shape', () => {
    const frame = fitCardFrame({ x: 0, y: 50, width: 375, height: 200 }, 375)!;
    expect(frame.height).toBe(200 - 16);
    expect(frame.width).toBeCloseTo((184 * 59) / 86, 5);
    expect(frame.width).toBeLessThan(375 * FRAME_WIDTH_SHARE);
  });

  it('has no frame before its space is known or when there is no room', () => {
    expect(fitCardFrame({ x: 0, y: 0, width: 0, height: 0 }, 390)).toBeNull();
    expect(fitCardFrame({ x: 0, y: 0, width: 390, height: 10 }, 390)).toBeNull();
  });

  it('outlines the Name and Set code areas where the phone reads them', () => {
    const frame = { x: 66, y: 80, width: 258, height: 376 };
    const name = areaRect(frame, NAME_AREA);
    expect(name.x).toBeCloseTo(66 + 0.04 * 258, 5);
    expect(name.width).toBeCloseTo((0.86 - 0.04) * 258, 5);
    expect(name.y).toBeCloseTo(80 + 0.02 * 376, 5);
    const code = areaRect(frame, SET_CODE_AREA);
    expect(code.x + code.width).toBeCloseTo(66 + 0.96 * 258, 5);
    expect(code.y).toBeCloseTo(80 + 0.71 * 376, 5);
  });
});

describe('what a screen reader hears when a photo lands', () => {
  it('says the card and its result', () => {
    expect(tileAnnouncement(tileOf())).toBe(`${YEW.name}, found`);
    expect(tileAnnouncement(tileOf(PICK_RARITY_LANTERN))).toBe('Endless Lantern, pick rarity');
  });

  it('says the copies of a grouped repeat, an unread card, and a card waiting', () => {
    const { session, tileId } = addPhoto(emptyScanSession(), {
      uri: 'file:///cache/b.jpg',
      width: 1,
      height: 1,
      owned: true,
    });
    const found = applyMatch(session, tileId, READ_YEW, FOUND_YEW);
    expect(tileAnnouncement(findTile(setCopies(found, tileId, 3), tileId)!)).toBe(
      `${YEW.name}, found, 3 copies`
    );
    expect(tileAnnouncement(findTile(markWaiting(session, tileId, READ_YEW), tileId)!)).toBe(
      'A card is waiting for connection'
    );
    expect(
      tileAnnouncement({ ...findTile(session, tileId)!, status: 'NOT_FOUND', card: null })
    ).toBe("Couldn't read this card");
  });

  it('words the counts of rarities', () => {
    expect(raritiesCount(7)).toBe('7 rarities');
    expect(manyRaritiesText(2)).toBe('This code comes in 2 rarities. Pick yours.');
  });
});

describe('the tray tiles look', () => {
  it('maps the mockup colours to the R1 tokens', () => {
    expect(tileTone('FOUND', darkPalette).status).toBe(darkPalette.accent);
    expect(tileTone('PICK_RARITY', darkPalette).status).toBe(darkPalette.warning);
    expect(tileTone('PICK_PRINTING', darkPalette).status).toBe(darkPalette.warning);
    expect(tileTone('NOT_FOUND', darkPalette)).toEqual({
      status: darkPalette.primary,
      border: darkPalette.primaryContainer,
    });
  });
});

describe('28: Other matches', () => {
  it("starts with the match shown, then the other matches, then the card's other printings", () => {
    const rail = matchRail(tileOf());
    expect(rail.map((item) => [item.code, item.sub, item.checked])).toEqual([
      ['ZACR-EN036', 'Secret Rare', true],
      ['ZACR-EN038', 'Super Rare', false],
      ['', '', false],
      ['ZRA4-EN025', '2 rarities', false],
      ['ZAGO-EN011', 'Premium Gold Rare', false],
    ]);
    expect(rail[1]?.choice).toEqual({ kind: 'OTHER', other: LYRA_OTHER });
    expect(rail[2]?.choice).toEqual({ kind: 'OTHER', other: FOX_BY_NAME });
    expect(rail[2]?.name).toBe(FOX.name);
    expect(rail[3]?.choice.kind).toBe('ROW');
  });

  it('shows a code in several rarities as one tile', () => {
    const rail = matchRail(tileOf(PICK_RARITY_LANTERN));
    expect(rail.map((item) => [item.code, item.sub])).toEqual([['ZRA1-EN075', '3 rarities']]);
  });

  it("is empty for a card that couldn't be read", () => {
    expect(matchRail({ ...tileOf(), card: null })).toEqual([]);
  });

  it('a row says its rarity, or how many', () => {
    expect(rowRarity({ printings: [ZACR_036] })).toBe('Secret Rare');
    expect(rowRarity({ printings: [ZACR_036, ZACR_036] })).toBe('2 rarities');
  });
});

describe('what was read', () => {
  it('shows the best code and the best name', () => {
    expect(readText(READ_YEW)).toBe(`ZACR-EN036 · ${YEW.name}`);
    expect(readText({ codes: [], names: ['Endless Lantern'] })).toBe('Endless Lantern');
    expect(readText({ codes: [], names: [] })).toBe('');
    expect(readText(null)).toBe('');
  });
});

describe("the printings of a card picked by hand (the catalog's)", () => {
  it('keeps the English ones, newest set first, a set without a date last', () => {
    const printings = printingsOfCard({
      id: 'card-x',
      printings: [
        {
          id: 'a',
          setCode: 'ZOLD',
          setName: 'Old',
          printingCode: 'ZOLD-EN001',
          setReleaseDate: '2002-03-08',
          language: 'EN',
        },
        {
          id: 'b',
          setCode: 'ZNEW',
          setName: 'New',
          printingCode: 'ZNEW-EN010',
          setReleaseDate: '2024-11-01',
          rarity: 'Ultra Rare',
        },
        {
          id: 'c',
          setCode: 'ZNEW',
          setName: 'New',
          printingCode: 'ZNEW-FR010',
          setReleaseDate: '2024-11-01',
          language: 'FR',
        },
        {
          id: 'd',
          setCode: 'ZUND',
          setName: 'Undated',
          printingCode: 'ZUND-EN001',
          language: 'English',
        },
        { setCode: 'ZNOID', setName: 'No id' },
      ],
    });
    expect(printings.map((printing) => printing.id)).toEqual(['b', 'a', 'd']);
    expect(printings[0]).toEqual({
      id: 'b',
      setCode: 'ZNEW',
      setName: 'New',
      printingCode: 'ZNEW-EN010',
      rarity: 'Ultra Rare',
    });
  });

  it('has none for a card without printings', () => {
    expect(printingsOfCard({ id: 'card-y' })).toEqual([]);
  });
});
