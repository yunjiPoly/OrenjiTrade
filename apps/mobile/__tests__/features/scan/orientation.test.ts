import type { OcrLine } from '@/src/features/scan/ocr/types';
import { sizeAfterTurn, turnBox, turnLines, uprightTurn } from '@/src/features/scan/orientation';
import { codeCandidates, nameCandidatesFromPhoto } from '@/src/features/scan/textPicking';
import {
  PENDULUM_READ,
  SIDEWAYS_PHOTO,
  SIDEWAYS_READ,
  SIDEWAYS_READ_TURNED_90,
  UPRIGHT_PHOTO,
  UPRIGHT_READ,
  UPSIDE_DOWN_PHOTO,
  UPSIDE_DOWN_READ,
} from '@/__tests__/support/visionReads';

/** Stacked full-width rows (wide boxes), top to bottom. */
function rows(...texts: string[]): OcrLine[] {
  return texts.map((text, index) => ({
    text,
    confidence: 0.9,
    box: { x: 0.05, y: 0.02 + index * 0.08, width: 0.9, height: 0.06 },
  }));
}

describe('which way up a card was read (Vision reads)', () => {
  it('finds an upright card upright, a Pendulum card too', () => {
    expect(uprightTurn(UPRIGHT_READ, UPRIGHT_PHOTO)).toBe(0);
    expect(uprightTurn(PENDULUM_READ, UPRIGHT_PHOTO)).toBe(0);
  });

  it('finds an upside-down card upside down', () => {
    expect(uprightTurn(UPSIDE_DOWN_READ, UPSIDE_DOWN_PHOTO)).toBe(180);
  });

  it('finds a card lying with its top on the right needs a 270° turn, not 90°', () => {
    expect(uprightTurn(SIDEWAYS_READ, SIDEWAYS_PHOTO)).toBe(270);
    // Turned 90° it is upside down (what batch B1 kept as "the first turn with both").
    expect(uprightTurn(SIDEWAYS_READ_TURNED_90, sizeAfterTurn(SIDEWAYS_PHOTO, 90))).toBe(180);
  });

  it('finds a card lying with its top on the left needs a 90° turn', () => {
    const topOnTheLeft = turnLines(SIDEWAYS_READ, 180);
    expect(uprightTurn(topOnTheLeft, SIDEWAYS_PHOTO)).toBe(90);
  });

  it('agrees with itself once the boxes are turned the way it says', () => {
    for (const [lines, size] of [
      [UPSIDE_DOWN_READ, UPSIDE_DOWN_PHOTO],
      [SIDEWAYS_READ, SIDEWAYS_PHOTO],
      [SIDEWAYS_READ_TURNED_90, sizeAfterTurn(SIDEWAYS_PHOTO, 90)],
    ] as const) {
      const turn = uprightTurn(lines, size);
      expect(turn).not.toBeNull();
      expect(uprightTurn(turnLines(lines, turn!), sizeAfterTurn(size, turn!))).toBe(0);
    }
  });

  it('picks the name first from a read turned the way it says', () => {
    // Read as it is, the upside-down card gives a line of its text before its name.
    expect(nameCandidatesFromPhoto(UPSIDE_DOWN_READ)[0]).not.toBe('Marble Roc Drake');
    expect(nameCandidatesFromPhoto(turnLines(UPSIDE_DOWN_READ, 180))[0]).toBe('Marble Roc Drake');
    // Read as it is, the sideways card's tall lines make one row: no name at all.
    expect(nameCandidatesFromPhoto(SIDEWAYS_READ)).toEqual([]);
    expect(nameCandidatesFromPhoto(turnLines(SIDEWAYS_READ, 270))[0]).toBe(
      'Crimson Lantern Dragon'
    );
    expect(codeCandidates(turnLines(SIDEWAYS_READ, 270))).toEqual(['ZRA1-EN075']);
  });
});

describe('which way up: the marks and the lead', () => {
  it('uses the set code when no passcode was read: the top is where fewer lines lie', () => {
    expect(
      uprightTurn(rows('Dark Moonseer', 'ZOB-EN005', '[Spellcaster]', 'The farthest', 'ATK/2500'), {
        width: 3000,
        height: 4000,
      })
    ).toBe(0);
    expect(
      uprightTurn(rows('ATK/2500', 'The farthest', '[Spellcaster]', 'ZOB-EN005', 'Dark Moonseer'), {
        width: 3000,
        height: 4000,
      })
    ).toBe(180);
  });

  it('gives no judgement without a clear lead or without a mark', () => {
    const size = { width: 3000, height: 4000 };
    expect(uprightTurn(rows('Inkshade Interference', 'ZA01-EN075'), size)).toBeNull();
    expect(uprightTurn(rows('Dark Moonseer', 'ZOB-EN005', 'The farthest'), size)).toBeNull();
    expect(uprightTurn(rows('Dark Moonseer', 'The farthest seeker'), size)).toBeNull();
    expect(uprightTurn([], size)).toBeNull();
  });

  it('prefers the passcode to the set code', () => {
    // Text above the code (a Pendulum box) would make the code alone say "upside down".
    const lines = rows(
      'Odd-Glass Magician',
      'Once per dusk: you can',
      'kindle the silver candle',
      'from an amulet',
      'ZPEN-EN015',
      'ATK/1500 DEF/1300',
      '50240865'
    );
    expect(uprightTurn(lines, { width: 3000, height: 4000 })).toBe(0);
  });
});

describe('turning boxes', () => {
  const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.05 };

  it('turns a box with the image, clockwise', () => {
    expect(turnBox(box, 0)).toEqual(box);
    expect(turnBox(box, 90)).toEqual({ x: 0.75, y: 0.1, width: 0.05, height: 0.3 });
    expect(turnBox(box, 180).x).toBeCloseTo(0.6);
    expect(turnBox(box, 180).y).toBeCloseTo(0.75);
    expect(turnBox(box, 270)).toEqual({ x: 0.2, y: 0.6, width: 0.05, height: 0.3 });
  });

  it('comes back after a full turn', () => {
    const back = turnBox(turnBox(turnBox(turnBox(box, 90), 90), 90), 90);
    expect(back.x).toBeCloseTo(box.x);
    expect(back.y).toBeCloseTo(box.y);
    expect(back.width).toBeCloseTo(box.width);
    expect(back.height).toBeCloseTo(box.height);
    const turned = turnBox(turnBox(box, 90), 270);
    expect(turned.x).toBeCloseTo(box.x);
    expect(turned.y).toBeCloseTo(box.y);
  });

  it('swaps the sides of a photo turned a quarter', () => {
    expect(sizeAfterTurn({ width: 3, height: 4 }, 90)).toEqual({ width: 4, height: 3 });
    expect(sizeAfterTurn({ width: 3, height: 4 }, 180)).toEqual({ width: 3, height: 4 });
    expect(sizeAfterTurn({ width: 3, height: 4 }, 270)).toEqual({ width: 4, height: 3 });
  });
});
