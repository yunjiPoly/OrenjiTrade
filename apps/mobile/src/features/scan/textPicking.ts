import { rowsOf, type OcrRow } from './ocr/lines';
import type { OcrLine } from './ocr/types';
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
 * printed (EN036 alone is no code).
 */
function parseTail(tail: string, { dashless }: { dashless: boolean }) {
  for (const regionLength of dashless ? [2, 1] : [2, 1, 0]) {
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
 * (the API tries each place). Returns the cleaned code, or null.
 *
 * The passcode never passes as a code. A set part made only of digits needs a region as printed
 * after it (2017-EN001; 2017-001 is no code), and the passcode has no region: its letters are at
 * most two misread digits (O, D, I, L, S, B, Z, G), and every region has a letter that is none of
 * them (E, N, F, R, T, P, J, K), except the old one-letter I, S and G, which a digit-only set part
 * never takes. Without a dash, a code needs a region as printed and, with a set part of letters,
 * two of them (`isPasscode`).
 */
export function parseCode(raw: string): CodeMatch | null {
  const cleaned = cleanCode(raw);
  if (cleaned.length === 0 || cleaned.length > MAX_CODE_LENGTH) {
    return null;
  }
  const parts = cleaned.split('-');
  if (parts.length === 1) {
    return parseDashless(cleaned);
  }
  if (parts.length > 3) {
    return null;
  }
  const [setPart = '', ...tailParts] = parts;
  const tail = tailParts.join('');
  if (!SET_PART.test(setPart)) {
    return null;
  }
  const parsed = parseTail(tail, { dashless: false });
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

function parseDashless(cleaned: string): CodeMatch | null {
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
    const parsed = parseTail(tail, { dashless: true });
    if (parsed?.strict) {
      return { code: cleaned, shape: 'dashless' };
    }
  }
  return null;
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
 * taken.
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
      const match = parseCode(tokens.slice(start, start + length).join(''));
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
 * The name candidates of a whole-photo read: the highest rows with at least 3 letters that are
 * not a code, a [SPELL CARD] or [TRAP CARD] line (or any bracketed type line), an attribute word,
 * level stars or stats. At most `max`, top first.
 */
export function nameCandidatesFromPhoto(
  lines: readonly OcrLine[],
  max: number = MAX_NAME_CANDIDATES
): string[] {
  return firstDistinct(
    rowsOf(lines)
      .map(nameOfRow)
      .filter((name): name is string => name !== null),
    max
  );
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
