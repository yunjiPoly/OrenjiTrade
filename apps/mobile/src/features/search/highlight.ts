/**
 * The typed part of a card name, for the results while typing (mockup screen 12: "Ash Bl" of "Ash
 * Blossom & Joyous Spring" in orange): the whole text when the name contains it, otherwise its
 * longest word that the name contains, ignoring case and accents. Nothing is highlighted when no
 * part matches (a result found by its printing code, or by a typo).
 */
export interface HighlightParts {
  before: string;
  match: string;
  after: string;
}

/** Folds one character for comparison: lower case, without its accent. */
function foldChar(char: string): string {
  return char.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The folded name and, for each folded character, the index of the character it came from. */
function foldWithIndex(text: string): { folded: string; origin: number[] } {
  let folded = '';
  const origin: number[] = [];
  Array.from(text).forEach((char, index) => {
    const part = foldChar(char);
    for (const piece of Array.from(part)) {
      folded += piece;
      origin.push(index);
    }
  });
  return { folded, origin };
}

export function highlightParts(name: string, query: string): HighlightParts {
  const chars = Array.from(name);
  const none = { before: name, match: '', after: '' };
  const wanted = Array.from(query.trim()).map(foldChar).join('').replace(/\s+/g, ' ');
  if (!wanted) {
    return none;
  }
  const { folded, origin } = foldWithIndex(name);
  const candidates = [
    wanted,
    ...wanted
      .split(' ')
      .filter(Boolean)
      .sort((a, b) => b.length - a.length),
  ];
  for (const candidate of candidates) {
    const at = folded.indexOf(candidate);
    if (at >= 0) {
      const start = origin[at] ?? 0;
      const end = (origin[at + candidate.length - 1] ?? start) + 1;
      return {
        before: chars.slice(0, start).join(''),
        match: chars.slice(start, end).join(''),
        after: chars.slice(end).join(''),
      };
    }
  }
  return none;
}
