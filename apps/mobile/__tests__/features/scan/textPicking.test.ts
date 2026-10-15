import { linesOf } from '@/src/features/scan/ocr/fakeOcrProvider';
import type { OcrLine } from '@/src/features/scan/ocr/types';
import {
  cleanCode,
  cleanName,
  codeCandidates,
  firstDistinct,
  nameCandidatesFromArea,
  nameCandidatesFromPhoto,
  parseCode,
} from '@/src/features/scan/textPicking';

/** A line where the reader saw it, in fractions of the image read. */
function at(
  text: string,
  x: number,
  y: number,
  width: number,
  height = 0.025,
  confidence: number | null = 0.9
): OcrLine {
  return { text, confidence, box: { x, y, width, height } };
}

/** Fixtures written as text: one row per entry, top to bottom. */
const codes = (...rows: string[]) => codeCandidates(linesOf(rows));
const areaNames = (...rows: string[]) => nameCandidatesFromArea(linesOf(rows));

/**
 * A whole-photo read of a Pendulum card: the code sits at the left under the pendulum text, and
 * the right spot holds pendulum text.
 */
const PENDULUM_CARD: OcrLine[] = [
  at('Dim-Glow Pendulum Dragon', 0.08, 0.06, 0.6, 0.04),
  at('DARK', 0.82, 0.06, 0.08, 0.04),
  at('★★★★★★★', 0.3, 0.12, 0.55, 0.03),
  at('Once per dusk, you can kindle the silver candle', 0.16, 0.6, 0.68),
  at('4', 0.09, 0.62, 0.03, 0.03),
  at('you draw from an amulet enclosing a Pendulum', 0.16, 0.63, 0.68),
  at('4', 0.88, 0.62, 0.03, 0.03),
  at('ZUEA-EN004', 0.07, 0.735, 0.25),
  at('[Dragon/Pendulum/Effect]', 0.07, 0.775, 0.4),
  at('Your opponent cannot shroud this lamp with mist glamour.', 0.07, 0.8, 0.85),
  at('ATK/2500 DEF/2000', 0.55, 0.905, 0.38),
  at('50248865', 0.04, 0.945, 0.15, 0.02),
  at('1st Edition', 0.25, 0.945, 0.15, 0.02),
  at('©1996 KAZUKI TAKAHASHI', 0.55, 0.945, 0.4, 0.02),
];

/** A whole-photo read of a normal monster: passcode, ATK/DEF and "1st Edition" in the read. */
const NORMAL_MONSTER: OcrLine[] = [
  at('Pale-Moon Frost Dragon', 0.08, 0.05, 0.6, 0.04),
  at('LIGHT', 0.83, 0.05, 0.1, 0.04),
  at('★★★★★★★★', 0.2, 0.11, 0.7, 0.03),
  at('ZOB-EN001', 0.7, 0.735, 0.22, 0.02),
  at('[Dragon/Normal]', 0.07, 0.76, 0.3),
  at('This moonbound dragon is a tireless keeper of candlelight.', 0.07, 0.79, 0.85),
  at('ATK/3000 DEF/2500', 0.55, 0.905, 0.38),
  at('57241194', 0.04, 0.945, 0.15, 0.02),
  at('1st Edition', 0.25, 0.945, 0.15, 0.02),
  at('©1996 KAZUKI TAKAHASHI', 0.55, 0.945, 0.4, 0.02),
];

describe('cleaning a code', () => {
  it('upper-cases it, removes the spaces and reads the separators as a dash', () => {
    expect(cleanCode(' zacr - en036 ')).toBe('ZACR-EN036');
    expect(cleanCode('ZACR–EN036')).toBe('ZACR-EN036');
    expect(cleanCode('ZACR—EN036')).toBe('ZACR-EN036');
    expect(cleanCode('ZACR_EN036')).toBe('ZACR-EN036');
    expect(cleanCode('ZACR.EN036')).toBe('ZACR-EN036');
    expect(cleanCode('ZACR~EN036')).toBe('ZACR-EN036');
  });

  it('keeps only A–Z, 0–9 and one dash, and never swaps letters and digits', () => {
    expect(cleanCode('(ZACR-EN036)™.')).toBe('ZACR-EN036');
    expect(cleanCode('ZAO1--ENO75')).toBe('ZAO1-ENO75');
    expect(cleanCode('ZOB-EN0O1')).toBe('ZOB-EN0O1');
  });
});

describe('the shape of a code', () => {
  it('knows codes as printed', () => {
    expect(parseCode('ZACR-EN036')).toEqual({ code: 'ZACR-EN036', shape: 'printed' });
    expect(parseCode('ZA01-EN075')?.shape).toBe('printed');
    expect(parseCode('Z5DD-ENC09')?.shape).toBe('printed');
    expect(parseCode('ZP22-EN257')?.shape).toBe('printed');
    expect(parseCode('ZDK-001')?.shape).toBe('printed');
  });

  it('refuses what is no code', () => {
    for (const text of ['ELM-KNIGHT', 'DIM-GLOW', 'LINK-3', 'X-5', '1-2', 'LP-1000', '57241194']) {
      expect(parseCode(text)).toBeNull();
    }
  });
});

describe('code candidates', () => {
  it('picks a clean read', () => {
    expect(codes('ZACR-EN036')).toEqual(['ZACR-EN036']);
  });

  it('passes O/0 and I/1 mistakes on as read (the server swaps them against the catalog)', () => {
    expect(codes('ZAO1-ENO75')).toEqual(['ZAO1-ENO75']);
    expect(codes('Z0B-EN0O1')).toEqual(['Z0B-EN0O1']);
    expect(codes('ZACR-EN03l')).toEqual(['ZACR-EN03L']);
    expect(codes('ZDK-1T001')).toEqual(['ZDK-1T001']);
  });

  it('picks old codes: ZOB-005 (North America) and ZOB-E001 (Europe)', () => {
    expect(codes('ZOB-005')).toEqual(['ZOB-005']);
    expect(codes('ZOB-E001')).toEqual(['ZOB-E001']);
  });

  it('picks a code with a letter before its digits', () => {
    expect(codes('ZAVD-ENS08')).toEqual(['ZAVD-ENS08']);
  });

  it("passes another language's code on, so the server refuses it", () => {
    expect(codes('ZACR-FR036')).toEqual(['ZACR-FR036']);
    expect(codes('ZOB-F001')).toEqual(['ZOB-F001']);
    expect(codes('ZACR-DE036')).toEqual(['ZACR-DE036']);
  });

  it('joins a code the reader cut with spaces', () => {
    expect(codes('ZACR - EN 036')).toEqual(['ZACR-EN036']);
    expect(codeCandidates([at('ZACR-', 0.1, 0.4, 0.3), at('EN036', 0.45, 0.4, 0.3)])).toEqual([
      'ZACR-EN036',
    ]);
  });

  it('keeps a code read without its dash, after the codes with one (the server tries each place)', () => {
    expect(codes('ZACREN036')).toEqual(['ZACREN036']);
    expect(codes('ZACREN036', 'ZACR-EN038')).toEqual(['ZACR-EN038', 'ZACREN036']);
    // Without its dash a code needs its region as printed: a cut "EN036" is no code.
    expect(codes('EN036')).toEqual([]);
    expect(codes('NUMBER39')).toEqual([]);
  });

  it('picks the code of a Pendulum card at the left, under the pendulum text', () => {
    expect(codeCandidates(PENDULUM_CARD)).toEqual(['ZUEA-EN004']);
  });

  it('never takes the passcode, ATK/DEF, LINK-n, "1st Edition" or "LIMITED EDITION"', () => {
    expect(codeCandidates(NORMAL_MONSTER)).toEqual(['ZOB-EN001']);
    expect(codes('57241194', 'ATK/2300 LINK-3', '1st Edition', 'LIMITED EDITION')).toEqual([]);
    expect(codes('1960B153')).toEqual([]);
    expect(codes('1st Edition ZOB-EN001')).toEqual(['ZOB-EN001']);
  });

  it('passes two codes on, best first: as printed, more confident, higher', () => {
    expect(codes('ZACR-EN036', 'ZACR-EN038')).toEqual(['ZACR-EN036', 'ZACR-EN038']);
    expect(
      codeCandidates([
        at('ZACR-EN036', 0.1, 0.2, 0.5, 0.05, 0.6),
        at('ZACR-EN038', 0.1, 0.6, 0.5, 0.05, 0.95),
      ])
    ).toEqual(['ZACR-EN038', 'ZACR-EN036']);
    expect(
      codeCandidates([
        at('ZACR-EN03G', 0.1, 0.2, 0.5, 0.05, 0.99),
        at('ZACR-EN036', 0.1, 0.6, 0.5, 0.05, 0.5),
      ])
    ).toEqual(['ZACR-EN036', 'ZACR-EN03G']);
  });

  it('keeps at most 3, each once', () => {
    expect(codes('ZOB-001', 'ZOB-002', 'ZOB-001', 'ZOB-003', 'ZOB-004')).toEqual([
      'ZOB-001',
      'ZOB-002',
      'ZOB-003',
    ]);
  });

  it('finds nothing in junk, or in nothing', () => {
    expect(codes('~~~', '|| |', '1l', '@#&', '— —', '0O0')).toEqual([]);
    expect(codes()).toEqual([]);
  });
});

describe('name candidates', () => {
  it('takes the Name area text', () => {
    expect(areaNames('Yew Flowers & Velvet Breeze')).toEqual(['Yew Flowers & Velvet Breeze']);
  });

  it("joins a name the reader cut in two, and leaves the attribute icon's word out", () => {
    expect(
      nameCandidatesFromArea([
        at('Yew Flowers &', 0.02, 0.3, 0.4, 0.4),
        at('Velvet Breeze', 0.45, 0.31, 0.35, 0.4),
        at('FIRE', 0.88, 0.3, 0.1, 0.4),
      ])
    ).toEqual(['Yew Flowers & Velvet Breeze']);
    expect(areaNames('Dark Moonseer DARK')).toEqual(['Dark Moonseer']);
    expect(areaNames('Wayward Light')).toEqual(['Wayward Light']);
  });

  it('puts the longest text of the area first, and keeps O/0 mistakes for the server', () => {
    expect(areaNames('Ia', 'Yew F1owers & Velvet Breeze', 'SPELL', 'Vel')).toEqual([
      'Yew F1owers & Velvet Breeze',
      'Vel',
    ]);
  });

  it('takes the highest rows of a whole photo that can be a name', () => {
    expect(nameCandidatesFromPhoto(NORMAL_MONSTER)).toEqual([
      'Pale-Moon Frost Dragon',
      'This moonbound dragon is a tireless keeper of candlelight',
    ]);
  });

  it('takes the name of a Pendulum card first, never its stars, type line, code or stats', () => {
    const names = nameCandidatesFromPhoto(PENDULUM_CARD);
    expect(names[0]).toBe('Dim-Glow Pendulum Dragon');
    expect(names).toHaveLength(3);
    for (const name of names) {
      expect(name).not.toMatch(/★|ZUEA|Dragon\/|ATK|50248865|Edition|KONAMI|TAKAHASHI/);
    }
  });

  it('never takes a spell or trap line, an attribute word, stars or stats', () => {
    expect(
      nameCandidatesFromPhoto(
        linesOf([
          '[SPELL CARD]',
          '[TRAP CARD ]',
          'DARK',
          'WATER',
          'DIVINE',
          '★★★★',
          '* * * *',
          'ATK/2500 DEF/2100',
          'ATK/2300 LINK-3',
          'LIMITED EDITION',
          'ZACR-EN036',
          '19608153',
        ])
      )
    ).toEqual([]);
  });

  it('keeps at most 3, the API length, each once', () => {
    expect(nameCandidatesFromPhoto(linesOf(['Alpha', 'Beta', 'alpha', 'Gamma', 'Delta']))).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
    expect(cleanName(`${'A'.repeat(200)}`)).toHaveLength(150);
  });

  it('finds nothing in junk, or in nothing', () => {
    expect(nameCandidatesFromPhoto(linesOf(['~~~', '|| |', '1l', '@#&', '— —', '0O0']))).toEqual(
      []
    );
    expect(nameCandidatesFromArea([])).toEqual([]);
    expect(nameCandidatesFromPhoto([])).toEqual([]);
  });

  it('tidies a name', () => {
    expect(cleanName('  • Yew   Flowers & Velvet Breeze |')).toBe('Yew Flowers & Velvet Breeze');
    expect(cleanName('"Emberforge Arms - Starhelm"')).toBe('"Emberforge Arms - Starhelm"');
    expect(cleanName('Number 39: Lanthe')).toBe('Number 39: Lanthe');
  });
});

describe('distinct entries', () => {
  it('keeps the first of entries equal but for case and spaces', () => {
    expect(firstDistinct(['Yew  Flowers', 'yew flowers', '', 'Lyra'], 3)).toEqual([
      'Yew  Flowers',
      'Lyra',
    ]);
  });
});
