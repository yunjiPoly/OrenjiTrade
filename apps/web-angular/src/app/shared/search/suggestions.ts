import type { SearchSuggestion } from '@orenji/api-client';

/** Kinds of `GET /search/suggest` entries (`SearchSuggestionTypeEnum` values). */
export type SuggestionType = 'CARD' | 'PRINTING' | 'SET' | 'COLLECTOR' | 'BINDER' | 'TAG';

export interface SuggestionGroup {
  id: string;
  label: string;
  items: SearchSuggestion[];
}

/** Display order of the autocomplete groups (the API interleaves one entry per kind). */
const GROUPS: readonly { id: string; label: string; types: readonly SuggestionType[] }[] = [
  { id: 'cards', label: 'Cards', types: ['CARD', 'PRINTING'] },
  { id: 'collectors', label: 'Collectors', types: ['COLLECTOR'] },
  { id: 'binders', label: 'Binders', types: ['BINDER'] },
  { id: 'sets', label: 'Sets', types: ['SET'] },
  { id: 'tags', label: 'Tags', types: ['TAG'] },
];

/** Groups suggestions by kind (empty groups dropped), keeping the API order inside a group. */
export function groupSuggestions(items: readonly SearchSuggestion[]): SuggestionGroup[] {
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = `${item.type}|${item.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: unique.filter((item) => (group.types as readonly string[]).includes(item.type)),
  })).filter((group) => group.items.length > 0);
}

/** Material Symbols glyph standing in for entries without a picture. */
export function suggestionIcon(type: string): string {
  switch (type) {
    case 'SET':
      return 'collections_bookmark';
    case 'COLLECTOR':
      return 'person';
    case 'BINDER':
      return 'menu_book';
    case 'TAG':
      return 'sell';
    default:
      return 'style';
  }
}

/** Short badge shown next to an entry ("Printing", "Tag"...). */
export function suggestionKindLabel(type: string): string {
  switch (type) {
    case 'CARD':
      return 'Card';
    case 'PRINTING':
      return 'Printing';
    case 'SET':
      return 'Set';
    case 'COLLECTOR':
      return 'Collector';
    case 'BINDER':
      return 'Binder';
    case 'TAG':
      return 'Tag';
    default:
      return '';
  }
}

/** Card entries (a card or one of its printings): they open the "holders near you" views. */
export function isCardSuggestion(item: SearchSuggestion): boolean {
  return item.type === 'CARD' || item.type === 'PRINTING';
}

/** Router target of an entry that has its own page (set, collector, binder); `null` otherwise. */
export function suggestionPage(item: SearchSuggestion): unknown[] | null {
  switch (item.type) {
    case 'SET':
      return ['/sets', item.id];
    case 'COLLECTOR':
      return item.slug ? ['/collectors', item.slug] : null;
    case 'BINDER':
      return ['/binders', item.id];
    default:
      return null;
  }
}

/** Query parameters that open the holders of a card entry (`card=` or `printing=`). */
export function holdersParams(item: SearchSuggestion): Record<string, string> | null {
  if (item.type === 'CARD') {
    return { card: item.id };
  }
  if (item.type === 'PRINTING') {
    return { printing: item.id };
  }
  return null;
}
