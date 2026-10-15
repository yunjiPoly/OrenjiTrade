import { linesOf } from '@/src/features/scan/ocr/fakeOcrProvider';
import type { OcrLine } from '@/src/features/scan/ocr/types';
import {
  cleanCode,
  cleanName,
  codeBand,
  codeCandidates,
  codeFragment,
  codeFragments,
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

/**
 * A whole-photo read of a fictional card on a table with another card behind it: the other card's
 * name at the photo's top edge, far right of this card's text column; this card's own name above
 * the artwork; its code cut short after the region ("ZR04-EN").
 */
const CARD_BEFORE_ANOTHER: OcrLine[] = [
  at('GLIMMERWING HERALD', 0.36, 0.0, 0.53, 0.037),
  at('QUILLFEATHER MAGE', 0.21, 0.197, 0.41, 0.045),
  at('ZR04-EN', 0.72, 0.75, 0.09, 0.013),
  at('[Spellcaster/Normal]', 0.198, 0.782, 0.385, 0.022),
  at('A quiet scholar who writes the winds into old books.', 0.2, 0.804, 0.56, 0.019),
  at('ATK/2500 DEF/2100', 0.56, 0.917, 0.31, 0.027),
  at('12345678 1st Edition', 0.178, 0.955, 0.236, 0.02),
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

  it('knows a set part made only of digits before a region as printed (2087-EN001)', () => {
    expect(parseCode('2087-EN001')).toEqual({ code: '2087-EN001', shape: 'printed' });
    expect(parseCode('2081-EN001')?.shape).toBe('printed');
    expect(parseCode('2087-EN0O1')).toEqual({ code: '2087-EN0O1', shape: 'misread' });
    expect(parseCode('2087EN001')).toEqual({ code: '2087EN001', shape: 'dashless' });
    expect(parseCode('2087 - EN 001')?.code).toBe('2087-EN001');
    // Another language's region is passed on (the server refuses it).
    expect(parseCode('2087-DE001')?.code).toBe('2087-DE001');
    // Without a region as printed, digits alone are no code: the passcode with a stray dash, a
    // misread region, an old one-letter region a misread digit could be, or no region at all.
    for (const text of [
      '2087-001',
      '2087-0E001',
      '2087-1T001',
      '2087-I001',
      '2087-S001',
      '5724-1194',
      '5724-II94',
      '57-241194',
      '5724.1I94',
    ]) {
      expect(parseCode(text)).toBeNull();
    }
  });

  it('refuses what is no code', () => {
    for (const text of ['ELM-KNIGHT', 'DIM-GLOW', 'LINK-3', 'X-5', '1-2', 'LP-1000', '57241194']) {
      expect(parseCode(text)).toBeNull();
    }
  });

  it('takes an old one-letter region without a dash only within one word', () => {
    expect(parseCode('ZOBE001')).toEqual({ code: 'ZOBE001', shape: 'dashless' });
    expect(parseCode('ZOBE001', { joined: true })).toBeNull();
    expect(parseCode('GAINS500', { joined: true })).toBeNull();
    // A two-letter region still makes a code of several words.
    expect(parseCode('ZR01EN075', { joined: true })).toEqual({
      code: 'ZR01EN075',
      shape: 'dashless',
    });
    // With its dash, a code joined from several words is the same code.
    expect(parseCode('ZOB-E001', { joined: true })).toEqual({ code: 'ZOB-E001', shape: 'printed' });
  });
});

describe('a code cut short', () => {
  /** The words of the table the API reads as English codes and the phone as no code. */
  const ENGLISH_FOR_THE_API_ONLY = [
    'ZR04-E01',
    'ZR04-E0O',
    'ZR04-EO0',
    'ZR04-EOO',
    'ZR04-ENOO',
    'ZR04-ES1',
  ];

  /**
   * Words of the shape of a code cut short, fragments and not: the same tables as the API's
   * `ScanCodesTest` (`ScanCodes.isFragment`), so that the phone and the API never drift apart.
   */
  const FRAGMENTS = [
    'ZR04-EN',
    'ZRO2-ENOT',
    'ZR04-ENO',
    'ZR04-EN0',
    'ZR04-E0',
    'ZR04-EO',
    'ZR04-ENX',
    'ZR04-ENA1',
    '2R0A-EN1',
  ];
  const NO_FRAGMENTS = [
    ...ENGLISH_FOR_THE_API_ONLY,
    // Codes (as printed or with look-alikes), another region, no letter or no digit in the set
    // part, nothing after E, more than two characters after the region, no dash, a long set part.
    'ZR04-EN015',
    'ZR04-EN01',
    'ZR04-ENO1',
    'ZR04-EN0O',
    'ZR04-E001',
    'ZR04-DE',
    'ZR04-E',
    'ZRAB-EN',
    '1234-EN',
    'ZR04-EXYZ',
    'ZR04-ENO15',
    'ZR04EN',
    'ZR0400-EN',
  ];

  it('is one word: a set part with a letter and a digit, a dash, E or EN and at most two more', () => {
    expect(codeFragment('ZR04-EN')).toBe('ZR04-EN');
    expect(codeFragment(' zr04-en ')).toBe('ZR04-EN');
    expect(codeFragment('ZR04-ENO')).toBe('ZR04-ENO');
    expect(codeFragment('ZRO2-ENOT')).toBe('ZRO2-ENOT');
    expect(codeFragment('ZR04–E0')).toBe('ZR04-E0');
  });

  it('is no code, no other shape and never several words', () => {
    for (const text of [
      'ZR04-EN015',
      'ZR04-ENO1',
      'ZR04-E',
      'ZRAB-EN',
      '1234-EN',
      'ZR04-DE',
      'ZR04-EXYZ',
      'ZR04-ENO15X',
      'ZR04 -EN',
      'ZR04-EN 015',
      'ELM-KNIGHT',
      '',
    ]) {
      expect(codeFragment(text)).toBeNull();
    }
  });

  it("is what the API reads as one: the same table as the API's ScanCodesTest", () => {
    expect(FRAGMENTS.map(codeFragment)).toEqual(FRAGMENTS);
    expect(NO_FRAGMENTS.filter((word) => codeFragment(word) !== null)).toEqual([]);
  });

  it('is never a word the API reads as an English code, which the phone sends no way', () => {
    // E or EN, then two digits or look-alike letters: the API reads a code (with look-alikes),
    // the phone none (3 digits after E, a real digit). No code, no fragment, and no name.
    for (const word of ENGLISH_FOR_THE_API_ONLY) {
      const read = linesOf(['Quillfeather Mage', word]);
      expect([
        word,
        codeCandidates(read),
        codeFragments(read),
        nameCandidatesFromPhoto(read),
      ]).toEqual([word, [], [], ['Quillfeather Mage']]);
    }
  });

  it('is found on its row of a read, the highest one only', () => {
    expect(codeFragments(CARD_BEFORE_ANOTHER)).toEqual(['ZR04-EN']);
    expect(codeFragments(linesOf(['ZQ11-EN', 'Quillfeather Mage', 'ZR04-EN']))).toEqual([
      'ZQ11-EN',
    ]);
    expect(codeFragments(linesOf(['Quillfeather Mage', 'ZR04-EN015']))).toEqual([]);
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
    // Its dash lost too: sent as read, the server tries each place of the dash.
    expect(codes('ZA 01EN075')).toEqual(['ZA01EN075']);
    expect(codeCandidates([at('ZACR-', 0.1, 0.4, 0.3), at('EN036', 0.45, 0.4, 0.3)])).toEqual([
      'ZACR-EN036',
    ]);
  });

  it("never makes a code of a card's text without a dash and a two-letter region", () => {
    // Effect text joined into an old one-letter region's code (S, E): GAINS500, LOSE100, ONCE800.
    for (const text of [
      'the lantern gains 500 ATK while it glows',
      'your opponent loses 100 LP',
      'The lantern may only glow once 800',
      'ZOB E001',
    ]) {
      expect(codes(text)).toEqual([]);
    }
    expect(codes('ZR01-EN075', 'the lantern gains 500 ATK')).toEqual(['ZR01-EN075']);
    // One word keeps its old region; a code cut by a space keeps its two-letter one.
    expect(codes('ZOBE001')).toEqual(['ZOBE001']);
    expect(codes('ZR 01EN075')).toEqual(['ZR01EN075']);
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
    // The passcode misread, cut, or next to the code: never a code itself.
    for (const passcode of ['5724II94', '5724-1194', '5724 1194', '5724.1194', 'I9608I53']) {
      expect(codes(passcode)).toEqual([]);
    }
    expect(codes('57241194 ZOB-EN001')).toEqual(['ZOB-EN001']);
    expect(codes('ZOB-EN001 57241194')).toEqual(['ZOB-EN001']);
  });

  it('picks the code of a set named by its year, never the passcode beside it', () => {
    expect(codes('2087-EN001')).toEqual(['2087-EN001']);
    expect(codes('2087-EN001 57241194')).toEqual(['2087-EN001']);
    expect(codes('57241194', '2088-EN002')).toEqual(['2088-EN002']);
    expect(codes('2089EN003')).toEqual(['2089EN003']);
    for (const passcode of ['57241194', '5724-1194', '5724 1194', '5724II94', '1960B153']) {
      expect(codes(passcode)).toEqual([]);
    }
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

  it('never takes the row of the passcode, even when the copyright beside it lost its ©', () => {
    // A whole-photo read that joined the passcode to the copyright line, its © misread and its
    // end cut by the frame: the passcode alone says it is no name.
    expect(
      nameCandidatesFromPhoto(
        linesOf(['Pale-Moon Frost Dragon', '57241194 Studio Dice/SHUEISHA, TV'])
      )
    ).toEqual(['Pale-Moon Frost Dragon']);
    expect(areaNames('57241194 Studio Dice', 'Yew Flowers & Velvet Breeze')).toEqual([
      'Yew Flowers & Velvet Breeze',
    ]);
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

  it('never takes a type line, its brackets read or lost, its words misread', () => {
    // What the library reads of batch B1 took as names.
    expect(
      nameCandidatesFromPhoto(
        linesOf([
          '(Warrior/Effect',
          'Cyberse/Link/Effect',
          'Machine/Effect',
          '[Dragon/Synchro/Tuner/Effect]',
          'Winged Beast/Etfect',
          'Sea Serpent / Effect )',
          '[Beast-Warrior/Effect1',
          'Gate Keeper of the Vault',
        ])
      )
    ).toEqual(['Gate Keeper of the Vault']);
    expect(areaNames('Machine/Effect', 'Iron Sentry')).toEqual(['Iron Sentry']);
  });

  it('never takes a code cut short after its region for a name', () => {
    expect(nameCandidatesFromPhoto(linesOf(['Quillfeather Mage', 'ZR04-EN', 'ZRO2-ENOT']))).toEqual(
      ['Quillfeather Mage']
    );
    expect(areaNames('ZR04-EN', 'Quillfeather Mage')).toEqual(['Quillfeather Mage']);
  });

  it("takes only names that start on the card's text column, never a card's behind it", () => {
    expect(nameCandidatesFromPhoto(CARD_BEFORE_ANOTHER)).toEqual([
      'QUILLFEATHER MAGE',
      'A quiet scholar who writes the winds into old books',
    ]);
    // A name the reader joined to the other card's text at its left keeps its own part.
    expect(
      nameCandidatesFromPhoto([
        at('HERA', 0.0, 0.2, 0.08, 0.04),
        ...CARD_BEFORE_ANOTHER.filter((line) => line.text !== 'GLIMMERWING HERALD'),
      ])[0]
    ).toBe('QUILLFEATHER MAGE');
  });

  it('keeps a name 0.1 column widths from the column, never one 0.17 away', () => {
    // The column of CARD_BEFORE_ANOTHER: from 0.178, 0.582 wide. A card's own name lay up to
    // 0.11 from it on the owner's real photos; the name of a card behind it 0.25 or more.
    const read = CARD_BEFORE_ANOTHER.map((line) =>
      line.text === 'QUILLFEATHER MAGE'
        ? { ...line, box: { ...line.box, x: 0.178 + 0.1 * 0.582 } }
        : line.text === 'GLIMMERWING HERALD'
          ? { ...line, box: { ...line.box, x: 0.178 + 0.17 * 0.582 } }
          : line
    );
    expect(nameCandidatesFromPhoto(read)).toEqual([
      'QUILLFEATHER MAGE',
      'A quiet scholar who writes the winds into old books',
    ]);
  });

  it("keeps the card's column when a line of a card beside it lies far to its left", () => {
    // A Pendulum card on the right half of the photo: its passcode starts a little left of its
    // text, its pendulum text further right; a card beside it shows its name and a line of its
    // text at the photo's left edge. The column's left edge is the lower quartile of the five
    // anchors' (the passcode's), not the leftmost (the other card's text).
    const read = [
      at('LANTERN WARDEN', 0.03, 0.05, 0.25, 0.04),
      at('TIDEGLASS SAGE', 0.36, 0.08, 0.4, 0.04),
      at('Once each turn the glass may tip toward the sea.', 0.44, 0.6, 0.45, 0.02),
      at('The lantern on the left glows over the old road.', 0.02, 0.45, 0.26, 0.02),
      at('[Spellcaster/Pendulum/Effect]', 0.36, 0.75, 0.3, 0.022),
      at('A sage who keeps the tides in a jar of glass.', 0.36, 0.78, 0.55, 0.02),
      at('87654321 1st Edition', 0.33, 0.95, 0.2, 0.02),
    ];
    expect(nameCandidatesFromPhoto(read)).toEqual([
      'TIDEGLASS SAGE',
      'A sage who keeps the tides in a jar of glass',
    ]);
  });

  it("never takes a spell's or trap's mark for the column: it lies at the right of its card", () => {
    // The photographed card on the right half; a trap lying beside it on the left, its
    // [TRAP CARD] mark (at its own right) left of this card's text.
    const read = [
      at('BRAMBLE SNARE', 0.02, 0.1, 0.24, 0.04),
      at('[TRAP CARD]', 0.28, 0.16, 0.18, 0.025),
      at('QUILLFEATHER MAGE', 0.56, 0.2, 0.35, 0.04),
      at('[Spellcaster/Normal]', 0.55, 0.78, 0.3, 0.022),
      at('A quiet scholar who writes the winds into old books.', 0.55, 0.8, 0.42, 0.019),
      at('12345678 1st Edition', 0.53, 0.95, 0.2, 0.02),
    ];
    expect(nameCandidatesFromPhoto(read)).toEqual([
      'QUILLFEATHER MAGE',
      'A quiet scholar who writes the winds into old books',
    ]);
  });

  it('keeps every name when the read shows no text column, or no name on it', () => {
    // One anchor (the type line) is no column.
    const noColumn = [
      at('GLIMMERWING HERALD', 0.36, 0.0, 0.53, 0.037),
      at('QUILLFEATHER MAGE', 0.21, 0.197, 0.41, 0.045),
      at('[Spellcaster/Normal]', 0.198, 0.782, 0.385, 0.022),
    ];
    expect(nameCandidatesFromPhoto(noColumn)).toEqual(['GLIMMERWING HERALD', 'QUILLFEATHER MAGE']);
    // A column, but no row that can be a name starts on it.
    expect(
      nameCandidatesFromPhoto([
        at('GLIMMERWING HERALD', 0.5, 0.05, 0.4, 0.04),
        at('[Spellcaster/Normal]', 0.1, 0.782, 0.385, 0.022),
        at('12345678 1st Edition', 0.1, 0.955, 0.236, 0.02),
      ])
    ).toEqual(['GLIMMERWING HERALD']);
  });

  it('keeps a name with a "/" that is no type line', () => {
    expect(
      nameCandidatesFromPhoto(linesOf(['Glassfin Dragon/Tempest Mode', 'Dragon/Effect']))
    ).toEqual(['Glassfin Dragon/Tempest Mode']);
    expect(nameCandidatesFromPhoto(linesOf(['Red Dragon Emberlord/Tempest Mode']))).toEqual([
      'Red Dragon Emberlord/Tempest Mode',
    ]);
    // One part a type word, another several words that are none: a name, not a type line.
    expect(nameCandidatesFromPhoto(linesOf(['Dragon/Knight of the Ember Gate']))).toEqual([
      'Dragon/Knight of the Ember Gate',
    ]);
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

describe('where the code lies', () => {
  const SIZE = { width: 3000, height: 4000 };
  const near = (band: ReturnType<typeof codeBand>, x: number, y: number, w: number, h: number) => {
    expect(band?.x).toBeCloseTo(x, 4);
    expect(band?.y).toBeCloseTo(y, 4);
    expect(band?.width).toBeCloseTo(w, 4);
    expect(band?.height).toBeCloseTo(h, 4);
  };

  it('is around a code cut short after its region, with room, centred where the whole code lies', () => {
    // The cut code: 0.72, 0.75, 0.09 x 0.013; the band 4.5 x 12 times it, centred at 0.7 of it.
    near(codeBand(CARD_BEFORE_ANOTHER, SIZE), 0.5805, 0.6785, 0.405, 0.156);
  });

  it("is right above the type line, at the right of the card's text column", () => {
    const noFragment = CARD_BEFORE_ANOTHER.filter((line) => line.text !== 'ZR04-EN');
    // The column: 0.178 to 0.76 (the passcode, the type line, the running text); the type line at
    // 0.782, 0.022 high: the band 6 times as high, centred a quarter of it above, 30 % to 110 %.
    near(
      codeBand(noFragment, SIZE),
      0.178 + 0.3 * 0.582,
      0.782 - 0.25 * 0.022 - 3 * 0.022,
      0.8 * 0.582,
      6 * 0.022
    );
  });

  it("is right above a spell's or trap's first line of text, which has no type line", () => {
    const trap = [
      at('BRAMBLE SNARE', 0.2, 0.06, 0.5, 0.045),
      at('[TRAP CARD]', 0.6, 0.13, 0.29, 0.028),
      at('Choose 1 lantern on the field; it glows a little brighter.', 0.2, 0.72, 0.75, 0.03),
      at('The snare closes once and then rests for a while.', 0.2, 0.75, 0.7, 0.03),
      at('12345678 1st Edition', 0.18, 0.93, 0.27, 0.02),
    ];
    // The column: 0.18 to 0.95.
    // The band stops at the image's right edge.
    near(
      codeBand(trap, SIZE),
      0.18 + 0.3 * 0.77,
      0.72 - 0.25 * 0.03 - 3 * 0.03,
      1 - (0.18 + 0.3 * 0.77),
      6 * 0.03
    );
  });

  it('is never on the mark of a card lying beside or behind the photographed one', () => {
    // Codes cut short of cards beside it, left and right of its text column, higher in the photo
    // than its own: the band is around its own.
    for (const x of [0.02, 0.9]) {
      const beside = [at('ZQ11-EN', x, 0.3, 0.09, 0.013), ...CARD_BEFORE_ANOTHER];
      expect(codeBand(beside, SIZE)).toEqual(codeBand(CARD_BEFORE_ANOTHER, SIZE));
    }
    // A card behind it shows its type line at the photo's top, right of this card's column: the
    // band is right above this card's own type line (0.782, 0.022 high), never at the top.
    const noFragment = CARD_BEFORE_ANOTHER.filter((line) => line.text !== 'ZR04-EN');
    const behind = codeBand([at('[Fairy/Effect]', 0.55, 0.04, 0.3, 0.022), ...noFragment], SIZE);
    expect(behind?.y).toBeCloseTo(0.782 - 0.25 * 0.022 - 3 * 0.022, 4);
    expect(behind?.height).toBeCloseTo(6 * 0.022, 4);
  });

  it('is nowhere without those marks, or when they lie sideways, and never leaves the image', () => {
    expect(codeBand(linesOf(['Quillfeather Mage']), SIZE)).toBeNull();
    expect(codeBand([at('ZR04-EN', 0.5, 0.2, 0.013, 0.09)], SIZE)).toBeNull();
    const edge = codeBand([at('ZR04-EN', 0.9, 0.0, 0.09, 0.013)], SIZE);
    expect(edge?.x).toBeCloseTo(0.7605, 4);
    expect(edge?.y).toBe(0);
    expect((edge?.x ?? 0) + (edge?.width ?? 0)).toBeCloseTo(1, 6);
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
