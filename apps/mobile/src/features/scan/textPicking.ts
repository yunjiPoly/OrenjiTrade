import { rowsOf, type OcrRow } from './ocr/lines';
import type { FractionRect, OcrLine } from './ocr/types';
import {
  MAX_CODE_CANDIDATES,
  MAX_CODE_LENGTH,
  MAX_NAME_CANDIDATES,
  MAX_NAME_LENGTH,
} from './types';

/**
 * Picking the text of a card (owner spec 2026-10-15, section 3.4): which lines the reader found
 * are printing codes and which may be the card's name. Pure and unit-tested. The phone only picks
 * candidates, best first; the API decides (`POST /cards/scan-match`), and it alone swaps
 * look-alike characters, against the catalog.
 */

// --- Codes ----------------------------------------------------------------------------------------

/** Read as "-" between the parts of a code: hyphens and dashes (–, —), minus, "_", "." and "~". */
const SEPARATORS = /[\u2010-\u2015\u2212_.~]/g;

/**
 * Cleans a code as read: upper case, no spaces, the separators as "-", only A–Z, 0–9 and "-" kept
 * (one dash at a time, none at the ends). Letters and digits are never swapped here.
 */
export function cleanCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(SEPARATORS, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** EN, or E on old English prints from Europe (old North American prints have none: LOB-005). */
const ENGLISH_REGIONS = new Set(['EN', 'E']);
/**
 * Other languages' regions, captured so the API can refuse them (English cards only): FR, DE, IT,
 * SP, PT (and JP, KR, which the API refuses too), and the old one-letter F, G, I, S, P.
 */
const OTHER_REGIONS = new Set(['FR', 'DE', 'IT', 'SP', 'PT', 'JP', 'KR', 'F', 'G', 'I', 'S', 'P']);

/** Digits a reader may print for a region's letter (the API's look-alike pairs). */
const LETTERS_OF_DIGIT: Readonly<Record<string, readonly string[]>> = {
  '0': ['O', 'D'],
  '1': ['I', 'L'],
  '2': ['Z'],
  '5': ['S'],
  '6': ['G'],
  '8': ['B'],
};

/** A digit of the number part, or a letter a reader may print for one (O, D, I, L, S, B, Z, G). */
const DIGITISH = '[0-9ODILSBZG]';
const NUMBER_AFTER_REGION = new RegExp(`^([A-Z]?)(${DIGITISH}{2,3})$`);
const NUMBER_ALONE = new RegExp(`^()(${DIGITISH}{2,3})$`);

/** Every way a region read with look-alike digits may be spelt in letters ("1T" → IT, LT). */
function spellings(region: string): string[] {
  return [...region].reduce<string[]>(
    (words, character) => {
      const letters = LETTERS_OF_DIGIT[character] ?? [character];
      return words.flatMap((word) => letters.map((letter) => word + letter));
    },
    ['']
  );
}

/** Whether `region` is a known region, and whether it was read as printed (no look-alike digit). */
function regionOf(region: string): { verbatim: boolean } | null {
  const known = (word: string) => ENGLISH_REGIONS.has(word) || OTHER_REGIONS.has(word);
  if (known(region)) {
    return { verbatim: true };
  }
  return spellings(region).some(known) ? { verbatim: false } : null;
}

/**
 * The part after the dash: an optional region, then 2 or 3 digits, sometimes after one letter
 * (LAVD-ENS08). A one-letter region (old prints, LOB-E001) is read as a letter and followed by 3
 * digits (a lone digit there is the number's: LP-1000 is no Italian code). At least one real digit:
 * a word of look-alike letters is not a number. Without its dash, a code needs a region read as
 * printed (EN036 alone is no code), and a two-letter one when it was joined from several words: the
 * old one-letter regions (E, F, G, I, S, P) only count within one word, or a card's text would give
 * codes ("gains 500 ATK" would be GAINS500, an old Spanish code).
 */
function parseTail(tail: string, { dashless, joined }: { dashless: boolean; joined: boolean }) {
  const regionLengths = dashless ? (joined ? [2] : [2, 1]) : [2, 1, 0];
  for (const regionLength of regionLengths) {
    if (tail.length <= regionLength) {
      continue;
    }
    let verbatim = true;
    if (regionLength > 0) {
      const region = regionOf(tail.slice(0, regionLength));
      if (!region || ((dashless || regionLength === 1) && !region.verbatim)) {
        continue;
      }
      verbatim = region.verbatim;
    }
    const rest = tail.slice(regionLength);
    const match = (regionLength > 0 ? NUMBER_AFTER_REGION : NUMBER_ALONE).exec(rest);
    const letter = match?.[1] ?? '';
    const digits = match?.[2] ?? '';
    if (!match || !/[0-9]/.test(digits)) {
      continue;
    }
    if (regionLength === 1 && (letter !== '' || digits.length !== 3)) {
      continue;
    }
    return { strict: verbatim && /^[0-9]+$/.test(digits) };
  }
  return null;
}

const SET_PART = /^[A-Z0-9]{2,5}$/;

function letterCount(value: string): number {
  return (value.match(/[A-Z]/g) ?? []).length;
}

/** How sure the shape is: a code as printed, a code with look-alikes or extra dashes, no dash. */
type CodeShape = 'printed' | 'misread' | 'dashless';

export interface CodeMatch {
  code: string;
  shape: CodeShape;
}

/**
 * Whether a piece of text is a printing code: a set part of 2 to 5 letters or digits (LOB, SDK,
 * RA01, MP22, L5DD, or the year of 2017-EN001), a dash, then the tail (`parseTail`). A code read
 * without its dash counts when a dash at one place gives a code as printed; it is sent as read
 * (the API tries each place). `joined`: the text was joined from several words of a row (a code
 * the reader cut with spaces). Returns the cleaned code, or null.
 *
 * The passcode never passes as a code. A set part made only of digits needs a region as printed
 * after it (2017-EN001; 2017-001 is no code), and the passcode has no region: its letters are at
 * most two misread digits (O, D, I, L, S, B, Z, G), and every region has a letter that is none of
 * them (E, N, F, R, T, P, J, K), except the old one-letter I, S and G, which a digit-only set part
 * never takes. Without a dash, a code needs a region as printed and, with a set part of letters,
 * two of them (`isPasscode`).
 */
export function parseCode(
  raw: string,
  { joined = false }: { joined?: boolean } = {}
): CodeMatch | null {
  const cleaned = cleanCode(raw);
  if (cleaned.length === 0 || cleaned.length > MAX_CODE_LENGTH) {
    return null;
  }
  const parts = cleaned.split('-');
  if (parts.length === 1) {
    return parseDashless(cleaned, joined);
  }
  if (parts.length > 3) {
    return null;
  }
  const [setPart = '', ...tailParts] = parts;
  const tail = tailParts.join('');
  if (!SET_PART.test(setPart)) {
    return null;
  }
  const parsed = parseTail(tail, { dashless: false, joined });
  if (!parsed || (letterCount(setPart) === 0 && !digitsOnlySetAllowed(tail))) {
    return null;
  }
  return {
    code: `${setPart}-${tail}`,
    shape: parsed.strict && parts.length === 2 ? 'printed' : 'misread',
  };
}

/**
 * After a set part made only of digits (2017-EN001), the tail must start with a region as printed
 * that the passcode cannot hold: EN, E or another language's two letters (each has a letter that is
 * no misread digit). The old one-letter I, S, G (and F, P) are left out.
 */
const REGION_AFTER_DIGITS = new RegExp(`^(?:EN|E|FR|DE|IT|SP|PT|JP|KR)[A-Z]?${DIGITISH}{2,3}$`);

function digitsOnlySetAllowed(tail: string): boolean {
  return REGION_AFTER_DIGITS.test(tail);
}

function parseDashless(cleaned: string, joined: boolean): CodeMatch | null {
  if (cleaned.length < 5 || cleaned.length > 11) {
    return null;
  }
  for (let dash = 2; dash <= 5; dash++) {
    const setPart = cleaned.slice(0, dash);
    const tail = cleaned.slice(dash);
    const letters = letterCount(setPart);
    if (letters === 1 || (letters === 0 && !digitsOnlySetAllowed(tail))) {
      continue;
    }
    const parsed = parseTail(tail, { dashless: true, joined });
    if (parsed?.strict) {
      return { code: cleaned, shape: 'dashless' };
    }
  }
  return null;
}

/** A set part, a dash, then E or EN and at most two more characters (`codeFragment`). */
const FRAGMENT = /^([A-Z0-9]{2,5})-(EN?[A-Z0-9]{0,2})$/;

/**
 * What the API reads after the dash as an English code, look-alike letters allowed for its digits
 * (`ScanCodes.mayBeEnglish`): E or EN, sometimes a letter, then 2 or 3 digits or look-alike letters
 * ("E01", "ENOO"). The phone's own codes are stricter (`parseTail`: 3 digits after E, at least one
 * real digit).
 */
const ENGLISH_FOR_THE_API = new RegExp(`^(?:EN|E)[A-Z]?${DIGITISH}{2,3}$`);

/**
 * A word shaped like a code cut short after its English region: one word, a set part of 2 to 5
 * letters and digits with at least one of each, a dash, E or EN and at most two more characters
 * (two at least after the dash), and no code (`parseCode`). It is no name (`isNotAName`). Returns
 * it cleaned and the part after its dash, or null.
 */
function cutCode(text: string): { cleaned: string; tail: string } | null {
  const word = text.trim();
  if (word.length === 0 || /\s/.test(word)) {
    return null;
  }
  const cleaned = cleanCode(word);
  const match = FRAGMENT.exec(cleaned);
  const setPart = match?.[1] ?? '';
  const tail = match?.[2] ?? '';
  if (!match || tail.length < 2 || !/[A-Z]/.test(setPart) || !/[0-9]/.test(setPart)) {
    return null;
  }
  return parseCode(cleaned) ? null : { cleaned, tail };
}

/**
 * A code the reader cut short after its English region, alone on its row ("ZR04-EN", "ZRO2-ENOT"):
 * a word of that shape (`cutCode`) the API reads as a fragment too (`ScanCodes.isFragment`), not as
 * an English code with look-alike digits ("ZR04-E01", "ZR04-ENOO": the phone takes neither for a
 * code, sends neither and takes neither for a name). The scan sends it as a code only when no read
 * of the photo holds a code (`readCardText`), and the API takes the named card's printing in that
 * set. Returns it cleaned, or null.
 */
export function codeFragment(text: string): string | null {
  const cut = cutCode(text);
  return cut && !ENGLISH_FOR_THE_API.test(cut.tail) ? cut.cleaned : null;
}

/** The code fragment of a read (`codeFragment`), the highest one; none when no row holds one. */
export function codeFragments(lines: readonly OcrLine[]): string[] {
  return firstDistinct(
    rowsOf(lines)
      .map((row) => codeFragment(row.text))
      .filter((fragment): fragment is string => fragment !== null),
    1
  );
}

/** Whether a line of text holds a printing code (`parseCode`), alone or among other words. */
export function holdsCode(text: string): boolean {
  return codesOfRow(text).length > 0;
}

/**
 * Whether a line of text holds the card's passcode (`isPasscode`, at least 6 real digits): the
 * bottom left of every card.
 */
export function holdsPasscode(text: string): boolean {
  return text
    .split(/\s+/)
    .some((token) => isPasscode(token) && token.replace(/[^0-9]/g, '').length >= 6);
}

/**
 * The 8-digit passcode at the bottom left (never used), or a stat: a run of 6 to 10 characters
 * without a dash, all digits but at most two misread ones. A row holding one is no name; no code
 * has its shape (`parseCode`).
 */
function isPasscode(token: string): boolean {
  if (token.includes('-')) {
    return false;
  }
  const characters = token.replace(/[^A-Z0-9]/gi, '');
  const digits = (characters.match(/[0-9]/g) ?? []).length;
  return characters.length >= 6 && characters.length <= 10 && digits >= characters.length - 2;
}

/** "1st Edition" and "LIMITED EDITION" are skipped (they are no code and no name). */
const EDITION = /\b1\s*S\s*T\s+EDITION\b|\bLIMITED\s+EDITION\b|\bEDITION\b/g;
/** ATK/ and DEF/ with their values, and LINK-n. */
const STATS = /\b(?:ATK|DEF)\b\s*[/|]?\s*[0-9?]*|\bLINK\s*[-–—]?\s*[0-9]\b/g;

interface FoundCode extends CodeMatch {
  confidence: number;
  order: number;
}

/**
 * The codes of one row of text, each token at most once. A code may be spread over up to 4 tokens
 * ("MACR - EN 036", or "RA 01EN075" with its dash lost); the longest span that makes a code is
 * taken. Without a dash, a code spread over several tokens needs a two-letter region (`parseTail`).
 */
function codesOfRow(text: string): CodeMatch[] {
  const tokens = text
    .toUpperCase()
    .replace(EDITION, ' ')
    .replace(STATS, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
  const found: CodeMatch[] = [];
  for (let start = 0; start < tokens.length;) {
    let taken = 0;
    for (let length = Math.min(4, tokens.length - start); length >= 1 && taken === 0; length--) {
      const match = parseCode(tokens.slice(start, start + length).join(''), {
        joined: length > 1,
      });
      if (match) {
        found.push(match);
        taken = length;
      }
    }
    start += Math.max(1, taken);
  }
  return found;
}

const SHAPE_RANK: Record<CodeShape, number> = { printed: 0, misread: 1, dashless: 2 };

/**
 * The code candidates of one read, best first: codes as printed, then codes with look-alikes or
 * extra dashes, then codes without a dash; the reader's more confident rows first, then top to
 * bottom. At most `max`, each once.
 */
export function codeCandidates(
  lines: readonly OcrLine[],
  max: number = MAX_CODE_CANDIDATES
): string[] {
  const found: FoundCode[] = [];
  rowsOf(lines).forEach((row, order) => {
    for (const match of codesOfRow(row.text)) {
      found.push({ ...match, confidence: row.confidence ?? 0, order });
    }
  });
  found.sort(
    (a, b) =>
      SHAPE_RANK[a.shape] - SHAPE_RANK[b.shape] || b.confidence - a.confidence || a.order - b.order
  );
  return firstDistinct(
    found.map((entry) => entry.code),
    max
  );
}

// --- Names ----------------------------------------------------------------------------------------

/** The attribute icon's words; spells and traps have SPELL and TRAP in that place. */
const ATTRIBUTE_WORDS = ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'];
const ICON_WORDS = new Set([...ATTRIBUTE_WORDS, 'SPELL', 'TRAP']);
const TRAILING_ICON_WORD = new RegExp(`\\s+(?:${[...ICON_WORDS].join('|')})$`);

const LEADING_NOISE = /^[^\p{L}\p{N}"'(¡¿]+/u;
const TRAILING_NOISE = /[^\p{L}\p{N}"'!?)]+$/u;

/**
 * A name as read, tidied: spaces collapsed, stray marks at the ends removed, and the attribute
 * icon's word ("Dark Magician DARK") dropped when the reader joined it to a name in lower case.
 * At most 150 characters (the API's limit).
 */
export function cleanName(raw: string): string {
  let name = raw.replace(/\s+/g, ' ').trim().replace(LEADING_NOISE, '').replace(TRAILING_NOISE, '');
  const icon = TRAILING_ICON_WORD.exec(name);
  if (icon && /\p{Ll}/u.test(name.slice(0, icon.index))) {
    name = name.slice(0, icon.index).replace(TRAILING_NOISE, '');
  }
  return [...name].slice(0, MAX_NAME_LENGTH).join('').trim();
}

const STAR = /[★☆✦✧✪✫✬✭✮✯✰*]/gu;

/** The words of a monster's type line ("[Dragon/Effect]", "[Cyberse/Link/Effect]"), lower case. */
const TYPE_WORDS = new Set([
  'aqua',
  'beast',
  'beast-warrior',
  'creator god',
  'cyberse',
  'dinosaur',
  'divine-beast',
  'dragon',
  'fairy',
  'fiend',
  'fish',
  'illusion',
  'insect',
  'machine',
  'plant',
  'psychic',
  'pyro',
  'reptile',
  'rock',
  'sea serpent',
  'spellcaster',
  'thunder',
  'warrior',
  'winged beast',
  'wyrm',
  'zombie',
  'normal',
  'effect',
  'fusion',
  'ritual',
  'synchro',
  'xyz',
  'pendulum',
  'link',
  'tuner',
  'flip',
  'gemini',
  'spirit',
  'toon',
  'union',
  'token',
]);

/**
 * Whether a row is a monster's type line, its brackets read or not ("[Dragon/Effect]",
 * "(Warrior/Effect", "Cyberse/Link/Effect", "Winged Beast/Etfect"): words joined by "/", one at
 * least a type word, every other one a type word or a single (misread) word. A name with a "/" is
 * kept: "Stardust Dragon/Assault Mode" has parts of several words that are no type.
 */
function isTypeLine(row: string): boolean {
  const parts = row
    .trim()
    .replace(/^[[({]+/, '')
    .replace(/[^\p{L}]+$/u, '')
    .split('/')
    .map((part) => part.trim().replace(/\s+/g, ' ').toLowerCase());
  if (parts.length < 2 || parts.some((part) => part.length === 0)) {
    return false;
  }
  return (
    parts.some((part) => TYPE_WORDS.has(part)) &&
    parts.every((part) => TYPE_WORDS.has(part) || !part.includes(' '))
  );
}

/** Why a row is not a name: a code, a spell/trap or type line, an icon word, stars, stats, ... */
function isNotAName(row: string, name: string): boolean {
  const upper = row.toUpperCase();
  return (
    (name.match(/\p{L}/gu) ?? []).length < 3 ||
    ICON_WORDS.has(name.toUpperCase()) ||
    /^\s*\[/.test(row) ||
    isTypeLine(row) ||
    /\b(?:SPELL|TRAP)\s*CARD\b/.test(upper) ||
    /\b(?:ATK|DEF)\b/.test(upper) ||
    /\bLINK\s*[-–—]?\s*[0-9]\b/.test(upper) ||
    (row.match(STAR) ?? []).length >= 2 ||
    /EDITION/.test(upper) ||
    /©|\bKONAMI\b|\bTAKAHASHI\b/.test(upper) ||
    codesOfRow(row).some((match) => match.shape !== 'dashless') ||
    cutCode(row) !== null ||
    holdsPasscode(row)
  );
}

function nameOfRow(row: OcrRow): string | null {
  const name = cleanName(row.text);
  return isNotAName(row.text, name) ? null : name;
}

/**
 * The name candidates of the Name area, best first: its rows that can be a name, the longest
 * first (the name fills the area; a stray mark or the icon's word is short). At most `max`.
 */
export function nameCandidatesFromArea(
  lines: readonly OcrLine[],
  max: number = MAX_NAME_CANDIDATES
): string[] {
  const names = rowsOf(lines)
    .map((row, order) => ({ name: nameOfRow(row), order }))
    .filter((entry): entry is { name: string; order: number } => entry.name !== null)
    .sort(
      (a, b) =>
        (b.name.match(/\p{L}/gu) ?? []).length - (a.name.match(/\p{L}/gu) ?? []).length ||
        a.order - b.order
    );
  return firstDistinct(
    names.map((entry) => entry.name),
    max
  );
}

/**
 * How far the left edge of a name may lie from the card's text column (`textColumn`), in widths of
 * the column. On the owner's real photos (gate, 2026-10-15) a card's own name started within 0.07
 * of its text column on the reads that stood upright (0.11 on a read turned back), the name of a
 * card lying behind it 0.25 to 0.32 away; other words of such cards lay anywhere from 0.1 on, and
 * some on the column by chance.
 */
export const NAME_ALIGNMENT = 0.12;

/** The left edge and width of a card's text column, in fractions of the image read. */
interface TextColumn {
  left: number;
  width: number;
}

/**
 * The card's text column, from the lines that start at its left edge: running text (5 words or
 * more, some in lower case), the monster's type line and the passcode line. Its left edge is the
 * lower quartile of their left edges (a Pendulum card's pendulum text starts further right, the
 * passcode a little further left), its right edge their farthest one. Null from fewer than 2.
 */
function textColumn(lines: readonly OcrLine[]): TextColumn | null {
  const anchors = lines.filter(
    (line) => isRunningText(line.text) || isTypeLine(line.text) || holdsPasscode(line.text)
  );
  if (anchors.length < 2) {
    return null;
  }
  const lefts = anchors.map((line) => line.box.x).sort((a, b) => a - b);
  const left = lefts[Math.floor((lefts.length - 1) / 4)] ?? 0;
  const right = Math.max(...anchors.map((line) => line.box.x + line.box.width));
  return right > left ? { left, width: right - left } : null;
}

/** A line of a card's running text: 5 words or more, some in lower case. */
function isRunningText(text: string): boolean {
  return text.trim().split(/\s+/).length >= 5 && /\p{Ll}/u.test(text);
}

/** Whether a box starts on the text column (within `NAME_ALIGNMENT` of its left edge). */
function startsOnColumn(box: FractionRect, column: TextColumn): boolean {
  return Math.abs(box.x - column.left) <= NAME_ALIGNMENT * column.width;
}

/**
 * Whether a box starts within the text column's width (from its left edge to its right one,
 * `NAME_ALIGNMENT` of it more on either side): the set code, at the right of the column.
 */
function startsWithinColumn(box: FractionRect, column: TextColumn): boolean {
  const slack = NAME_ALIGNMENT * column.width;
  return box.x >= column.left - slack && box.x <= column.left + column.width + slack;
}

/**
 * The part of a row that starts on the text column: the row from its first line whose left edge
 * lies within `NAME_ALIGNMENT` of the column's (a name the reader joined to a mark at its left
 * keeps the name); null when none does.
 */
function partOnColumn(row: OcrRow, column: TextColumn): OcrRow | null {
  const from = row.lines.findIndex((line) => startsOnColumn(line.box, column));
  if (from <= 0) {
    return from === 0 ? row : null;
  }
  const lines = row.lines.slice(from);
  return { ...row, text: lines.map((line) => line.text.trim()).join(' '), lines };
}

/**
 * The name candidates of a whole-photo read: the highest rows with at least 3 letters that are
 * not a code, a [SPELL CARD] or [TRAP CARD] line (or any bracketed type line), an attribute word,
 * level stars or stats. When the read shows the card's text column (`textColumn`), only rows that
 * start on it: the name of a card lying behind the photographed one starts elsewhere (unless no
 * row that can be a name starts on it). At most `max`, top first.
 */
export function nameCandidatesFromPhoto(
  lines: readonly OcrLine[],
  max: number = MAX_NAME_CANDIDATES
): string[] {
  const rows = rowsOf(lines);
  const names = (candidates: readonly OcrRow[]) =>
    candidates.map(nameOfRow).filter((name): name is string => name !== null);
  const column = textColumn(lines);
  const aligned = column
    ? names(rows.map((row) => partOnColumn(row, column)).filter((row) => row !== null))
    : [];
  return firstDistinct(aligned.length > 0 ? aligned : names(rows), max);
}

// --- Where the code lies -------------------------------------------------------------------------

/** A size in pixels. */
interface PixelSize {
  width: number;
  height: number;
}

/** The part of a box inside the image (0 to 1); null when none is. */
function insideImage(box: FractionRect): FractionRect | null {
  const left = Math.max(0, box.x);
  const top = Math.max(0, box.y);
  const right = Math.min(1, box.x + box.width);
  const bottom = Math.min(1, box.y + box.height);
  return right > left && bottom > top
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null;
}

/**
 * The band around a code cut short: its centre at `centre` widths from the cut code's left edge
 * (a code of 10 characters read as its first 7), `width` and `height` times the cut code's.
 */
export const FRAGMENT_BAND = { centre: 0.7, width: 4.5, height: 12 };

/**
 * The band above the top of the text box: its centre `centre` heights of that line above it,
 * `height` times its height, from `left` to `right` widths of the text column.
 */
export const TEXT_TOP_BAND = { centre: 0.25, height: 6, left: 0.3, right: 1.1 };

/**
 * The band where the set code lies in a whole-photo read that holds no code, to read it again like
 * the camera's set code area (`readCardText`, library photos). In fractions of the image read, the
 * card upright; null when the read shows neither of these marks:
 *
 * - a code cut short after its region (`codeFragment`) that starts within the card's text column
 *   (`textColumn`, when the read shows one: the code is printed at its right): the band is
 *   centred where the whole code lies (the rest of it to the right), `FRAGMENT_BAND.width` times
 *   its width and `FRAGMENT_BAND.height` times its height;
 * - the top of the card's text box, starting on its text column: the type line, or a spell's or
 *   trap's first line of running text. The set code is printed right above it at the right, under
 *   the artwork: the band is centred a quarter of that line's height above it,
 *   `TEXT_TOP_BAND.height` times its height, from 30 % of the column's width to 110 %.
 *
 * A mark of a card lying beside or behind the photographed one starts elsewhere and is passed
 * over, so that the band never reads that card's code. The band holds the code with room around
 * it: on the owner's real photos (gate, 2026-10-15) Apple Vision read nothing in a crop holding
 * little more than a legible code (538 × 155 pixels around it), and read it in crops several
 * times its size. A mark whose box is taller than wide in the image's pixels (`size`) lies
 * sideways: no band.
 */
export function codeBand(lines: readonly OcrLine[], size: PixelSize): FractionRect | null {
  const wide = (box: FractionRect) => box.width * size.width > box.height * size.height;
  const rows = rowsOf(lines);
  const column = textColumn(lines);
  const fragment = rows.find(
    (row) =>
      codeFragment(row.text) !== null &&
      wide(row.box) &&
      (column === null || startsWithinColumn(row.box, column))
  );
  if (fragment) {
    const { x, y, width, height } = fragment.box;
    const bandWidth = FRAGMENT_BAND.width * width;
    const bandHeight = FRAGMENT_BAND.height * height;
    return insideImage({
      x: x + FRAGMENT_BAND.centre * width - bandWidth / 2,
      y: y + height / 2 - bandHeight / 2,
      width: bandWidth,
      height: bandHeight,
    });
  }
  if (!column) {
    return null;
  }
  const onColumn = (row: OcrRow) => startsOnColumn(row.box, column) && wide(row.box);
  const top =
    rows.find((row) => isTypeLine(row.text) && onColumn(row)) ??
    rows.find((row) => isRunningText(row.text) && onColumn(row));
  if (!top) {
    return null;
  }
  const bandHeight = TEXT_TOP_BAND.height * top.box.height;
  const left = column.left + TEXT_TOP_BAND.left * column.width;
  return insideImage({
    x: left,
    y: top.box.y - TEXT_TOP_BAND.centre * top.box.height - bandHeight / 2,
    width: column.left + TEXT_TOP_BAND.right * column.width - left,
    height: bandHeight,
  });
}

// --- Both -----------------------------------------------------------------------------------------

/** The first `max` distinct entries (case and spaces ignored), in order. */
export function firstDistinct(values: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const key = value.toUpperCase().replace(/\s+/g, ' ').trim();
    if (key.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(value);
    if (kept.length >= max) {
      break;
    }
  }
  return kept;
}
