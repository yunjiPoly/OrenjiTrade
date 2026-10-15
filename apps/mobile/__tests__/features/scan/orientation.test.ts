import type { OcrLine } from '@/src/features/scan/ocr/types';
import { sizeAfterTurn, turnBox, turnLines, uprightTurn } from '@/src/features/scan/orientation';
import {
  codeCandidates,
  holdsPasscode,
  nameCandidatesFromPhoto,
} from '@/src/features/scan/textPicking';
import {
  PENDULUM_NO_PASSCODE_PHOTO,
  PENDULUM_NO_PASSCODE_READ,
  PENDULUM_NO_PASSCODE_READ_TURNED_180,
  PENDULUM_READ,
  SIDEWAYS_PHOTO,
  SIDEWAYS_READ,
  SIDEWAYS_READ_TURNED_90,
  SPELL_READ,
  UPRIGHT_PHOTO,
  UPRIGHT_READ,
  UPSIDE_DOWN_PHOTO,
  UPSIDE_DOWN_READ,
} from '@/__tests__/support/visionReads';

function line(text: string, x: number, y: number, width: number, height: number): OcrLine {
  return { text, confidence: 1, box: { x, y, width, height } };
}

function withoutPasscode(lines: readonly OcrLine[]): OcrLine[] {
  return lines.filter((entry) => !holdsPasscode(entry.text));
}

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

describe('which way up: the passcode', () => {
  it('prefers the passcode to the set code', () => {
    // The code alone says "upside down": the only wide gap lies below it.
    const lines = [
      line('ZPEN-EN015', 0.1, 0.1, 0.1, 0.02),
      line('Once per dusk: you can kindle', 0.1, 0.6, 0.6, 0.02),
      line('ATK/1500 DEF/1300', 0.5, 0.7, 0.3, 0.02),
      line('50240865', 0.1, 0.8, 0.15, 0.02),
    ];
    expect(uprightTurn(withoutPasscode(lines), { width: 3000, height: 4000 })).toBe(180);
    expect(uprightTurn(lines, { width: 3000, height: 4000 })).toBe(0);
  });

  it('leaves out the short lines: stars, marks, the icon letters', () => {
    // Above the passcode two lines; below it three marks of fewer than four letters or digits.
    const lines = rows('Dark Moonseer', 'The farthest seeker', '32705967', '1st', '*', 'R');
    expect(uprightTurn(lines, { width: 3000, height: 4000 })).toBe(0);
  });
});

describe('which way up: the set code, when no passcode was read', () => {
  it('finds the top on the side of the artwork, the one wide gap between the lines', () => {
    for (const [lines, size, turn] of [
      [UPRIGHT_READ, UPRIGHT_PHOTO, 0],
      [PENDULUM_READ, UPRIGHT_PHOTO, 0],
      [SPELL_READ, UPRIGHT_PHOTO, 0],
      [UPSIDE_DOWN_READ, UPSIDE_DOWN_PHOTO, 180],
      [SIDEWAYS_READ, SIDEWAYS_PHOTO, 270],
      [SIDEWAYS_READ_TURNED_90, sizeAfterTurn(SIDEWAYS_PHOTO, 90), 180],
      [turnLines(SIDEWAYS_READ, 180), SIDEWAYS_PHOTO, 90],
    ] as const) {
      expect(uprightTurn(withoutPasscode(lines), size)).toBe(turn);
    }
  });

  it('finds a Pendulum card upright although its pendulum text puts more lines above the code', () => {
    // Batch B1 judged it upside down (6 lines above the code, 3 below) and kept the 180° read.
    expect(uprightTurn(PENDULUM_NO_PASSCODE_READ, PENDULUM_NO_PASSCODE_PHOTO)).toBe(0);
    expect(uprightTurn(PENDULUM_NO_PASSCODE_READ_TURNED_180, PENDULUM_NO_PASSCODE_PHOTO)).toBe(180);
  });

  it('finds a Spell upright although its name, icon word and type line outnumber its text', () => {
    const spell = [
      ...withoutPasscode(SPELL_READ).filter((entry) => !entry.text.startsWith('shuffle')),
      line('SPELL', 0.62, 0.119, 0.05, 0.012),
    ];
    expect(uprightTurn(spell, UPRIGHT_PHOTO)).toBe(0);
    expect(uprightTurn(turnLines(spell, 180), UPRIGHT_PHOTO)).toBe(180);
  });

  it('gives no judgement without the artwork, or with a wide gap on both sides', () => {
    // The name not read: no line above the artwork, whichever way up the card lies.
    const noName = withoutPasscode(UPRIGHT_READ).filter(
      (entry) => !entry.text.startsWith('Crimson')
    );
    expect(uprightTurn(noName, UPRIGHT_PHOTO)).toBeNull();
    expect(uprightTurn(turnLines(noName, 180), UPRIGHT_PHOTO)).toBeNull();
    // A second wide gap below the code (text far under the card).
    const below = [
      ...withoutPasscode(UPRIGHT_READ),
      line('Printed in Fiction', 0.3, 0.95, 0.2, 0.01),
    ];
    expect(uprightTurn(below, UPRIGHT_PHOTO)).toBeNull();
    // Rows with no gap at all, or no mark.
    const size = { width: 3000, height: 4000 };
    expect(uprightTurn(rows('Inkshade Interference', 'ZA01-EN075'), size)).toBeNull();
    expect(uprightTurn(rows('Dark Moonseer', 'ZOB-EN005', 'The farthest'), size)).toBeNull();
    expect(uprightTurn(rows('Dark Moonseer', 'The farthest seeker'), size)).toBeNull();
    expect(uprightTurn([], size)).toBeNull();
  });

  it('measures the gaps against the length of the code', () => {
    // An old seven-character code above a text box read empty: 1.5 code lengths, no artwork.
    const lines = [
      line('ZOB-005', 0.603, 0.422, 0.066, 0.011),
      line('ATK/2100 DEF/2300', 0.577, 0.509, 0.092, 0.013),
      line('©2026 ORENJI FICTION', 0.583, 0.526, 0.089, 0.011),
    ];
    expect(uprightTurn(lines, UPRIGHT_PHOTO)).toBeNull();
    // With the name above the artwork: upright.
    expect(
      uprightTurn([line('Ancient Brass Golem', 0.319, 0.116, 0.239, 0.02), ...lines], UPRIGHT_PHOTO)
    ).toBe(0);
  });

  it('judges the run of the text in pixels of the image read, not in its fractions', () => {
    // A photo three times wider than tall: boxes taller than wide in fractions are wide in pixels,
    // so the text runs across and the card stands upright (the artwork between name and code).
    const size = { width: 3000, height: 1000 };
    const lines = [
      line('Gate Keeper', 0.45, 0.1, 0.03, 0.04),
      line('ZIRO-EN001', 0.45, 0.7, 0.03, 0.035),
      line('Warrior Effect', 0.45, 0.75, 0.03, 0.04),
    ];
    expect(uprightTurn(lines, size)).toBe(0);
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
