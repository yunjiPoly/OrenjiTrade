import type { CardSuggestion, CollectorByName } from '@orenji/api-client';

/** Cards shown at most, collectors at most (spec 4.4). */
export const SEARCH_CARD_ROWS = 8;
export const SEARCH_COLLECTOR_ROWS = 3;
/** Typing waits this long, and starts from this many characters (spec 4.4). */
export const SEARCH_DEBOUNCE_MS = 150;
export const SEARCH_MIN_CHARS = 2;

/** One option of the dropdown's listbox. */
export type SearchOption =
  | {
      kind: 'card';
      id: string;
      card: CardSuggestion;
      commands: unknown[];
      queryParams: Record<string, string>;
    }
  | {
      kind: 'collector';
      id: string;
      collector: CollectorByName;
      commands: unknown[];
      queryParams: Record<string, string>;
    }
  | { kind: 'binders'; id: string; commands: unknown[]; queryParams: Record<string, string> };

/** A text split around its first case-insensitive match (the match is drawn orange 600). */
export interface MatchParts {
  pre: string;
  hit: string;
  post: string;
}

export function splitMatch(text: string, query: string): MatchParts {
  const needle = query.trim().toLowerCase();
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (index < 0) {
    return { pre: text, hit: '', post: '' };
  }
  return {
    pre: text.slice(0, index),
    hit: text.slice(index, index + needle.length),
    post: text.slice(index + needle.length),
  };
}

/** The printing code of a printing entry, compared without spaces or case. */
function codeKey(code: string | undefined): string {
  return (code ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Where a card entry opens (spec 4.4): `/cards/:id`; a printing code that matches exactly one
 * printing opens with `printing=` preselected, a code several printings share opens on "Any
 * printing" (the recorded first-printing defect).
 */
export function cardTarget(
  card: CardSuggestion,
  all: readonly CardSuggestion[],
): { commands: unknown[]; queryParams: Record<string, string> } {
  const commands = ['/cards', card.id];
  if (card.kind === 'PRINTING' && card.printingId) {
    const key = codeKey(card.printingCode);
    const sharing = all.filter(
      (entry) => entry.kind === 'PRINTING' && codeKey(entry.printingCode) === key,
    );
    if (key && sharing.length === 1) {
      return { commands, queryParams: { printing: card.printingId } };
    }
  }
  return { commands, queryParams: {} };
}

/** The listbox of a query: up to 8 cards, up to 3 collectors, then "Search binders and deck cores". */
export function searchOptions(
  query: string,
  cards: readonly CardSuggestion[],
  collectors: readonly CollectorByName[],
): SearchOption[] {
  const shownCards = dedupeCards(cards).slice(0, SEARCH_CARD_ROWS);
  const options: SearchOption[] = shownCards.map((card, index) => ({
    kind: 'card',
    id: `gs-opt-card-${index}`,
    card,
    ...cardTarget(card, shownCards),
  }));
  collectors.slice(0, SEARCH_COLLECTOR_ROWS).forEach((collector, index) =>
    options.push({
      kind: 'collector',
      id: `gs-opt-collector-${index}`,
      collector,
      commands: ['/collectors', collector.handle],
      queryParams: {},
    }),
  );
  options.push({
    kind: 'binders',
    id: 'gs-opt-binders',
    commands: ['/search'],
    queryParams: { tab: 'binders', q: query.trim() },
  });
  return options;
}

/** One row per card or printing (the API may repeat an entry). */
function dedupeCards(cards: readonly CardSuggestion[]): CardSuggestion[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = `${card.kind}|${card.printingId ?? card.id}`;
    if (!card.id || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
