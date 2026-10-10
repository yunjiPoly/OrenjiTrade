import type {
  CardSuggestion,
  GameMetadataField,
  MarketPrice,
  PrintingSummary,
} from '@/src/api/types';

/**
 * Catalog wording and helpers shared by the Search tab, the card detail and the add-card flow
 * (mirror of the web's `shared/catalog/catalog-labels.ts`, `catalog-constants.ts` and the
 * printing helpers of `shared/inventory/inventory-labels.ts`). Values come from each game's
 * `GameSchema`; unknown values are shown readably instead of disappearing.
 */

/** Bounds of the catalog API's query parameters (docs/api/openapi.json). */
export const QUERY_MAX_LENGTH = 100;
/** Characters needed before autocomplete suggestions are requested. */
export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_DEBOUNCE_MS = 250;
/** Debounce of the Search tab's live results (the web's `/cards` field). */
export const SEARCH_DEBOUNCE_MS = 350;
/** Page size of the Search tab (the API allows 1–100). */
export const CARD_PAGE_SIZE = 24;

/** Looks like a printing code (`AZR-EN001`, `SV4-123`). */
export const PRINTING_CODE = /^[a-z0-9]{2,6}-[a-z]{0,3}\d{1,4}[a-z]?$/i;

const EDITION_LABELS: Record<string, string> = {
  FIRST_EDITION: '1st Edition',
  UNLIMITED: 'Unlimited',
  LIMITED: 'Limited',
  SHADOWLESS: 'Shadowless',
};

const FINISH_LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  FOIL: 'Foil',
  HOLO: 'Holo',
  REVERSE_HOLO: 'Reverse holo',
  ALT_ART: 'Alt art',
  ETCHED: 'Etched',
};

/** English names of the catalog languages (Hermes has no `Intl.DisplayNames`). */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  ja: 'Japanese',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ko: 'Korean',
  zh: 'Chinese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
};

/** `FIRST_EDITION` -> `First edition` for values without a curated label. */
export function titleCaseEnum(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase().trim();
  return words ? (words[0] ?? '').toUpperCase() + words.slice(1) : value;
}

export function editionLabel(value: string | null | undefined): string {
  return value ? (EDITION_LABELS[value] ?? titleCaseEnum(value)) : '—';
}

export function finishLabel(value: string | null | undefined): string {
  return value ? (FINISH_LABELS[value] ?? titleCaseEnum(value)) : '—';
}

/** ISO 639-1 code -> English language name (`fr` -> `French`); the code when unknown. */
export function languageName(code: string | null | undefined): string {
  if (!code) {
    return '—';
  }
  const known = LANGUAGE_NAMES[code.toLowerCase()];
  if (known) {
    return known;
  }
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language' });
    const name = names.of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) {
      return name;
    }
  } catch {
    // No Intl.DisplayNames (Hermes): the code below.
  }
  return code.toUpperCase();
}

/** `CA$45.00`; `null` without an amount. */
export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined = 'CAD',
  locale = 'en-CA'
): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return null;
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'CAD',
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ''}`.trim();
  }
}

/**
 * An amount with its currency code after it, two decimals ("1,234.50 CAD"): the wording of
 * market prices and of the wish price term amounts ("85% TCG ≈ 21.25 USD"), so a CAD market
 * price never reads as "$" next to a term (web: `formatAmountWithCode`). No Intl (Hermes).
 */
export function formatAmountWithCode(amount: number, currency: string | null | undefined): string {
  const fixed = amount.toFixed(2);
  const point = fixed.indexOf('.');
  const grouped = fixed.slice(0, point).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}${fixed.slice(point)} ${currency ?? ''}`.trim();
}

/** Market price with its currency code (`42.00 CAD`), or `null` when the printing has none. */
export function formatMarketPrice(price: MarketPrice | null | undefined): string | null {
  if (!price || price.amount === null || price.amount === undefined) {
    return null;
  }
  return Number.isFinite(price.amount)
    ? formatAmountWithCode(price.amount, price.currency || 'CAD')
    : null;
}

/** A metadata value rendered according to its schema field type. */
export function formatMetadataValue(
  field: Pick<GameMetadataField, 'type'> | null,
  value: unknown
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => String(item)).join(', ') : '—';
  }
  if (field?.type === 'boolean' || typeof value === 'boolean') {
    return value === true || value === 'true' ? 'Yes' : 'No';
  }
  if (field?.type === 'number' && typeof value === 'number') {
    return new Intl.NumberFormat('en-CA').format(value);
  }
  return String(value);
}

export interface MetadataEntry {
  key: string;
  label: string;
  value: string;
}

function keyLabel(key: string): string {
  return titleCaseEnum(key.replace(/([a-z])([A-Z])/g, '$1_$2'));
}

/** Schema-ordered metadata entries: declared fields first, then undeclared keys. */
export function metadataEntries(
  fields: readonly GameMetadataField[] | null | undefined,
  metadata: Record<string, unknown> | null | undefined
): MetadataEntry[] {
  const values = metadata ?? {};
  const declared = fields ?? [];
  const entries: MetadataEntry[] = [];
  const seen = new Set<string>();
  for (const field of declared) {
    seen.add(field.key);
    const raw = values[field.key];
    if (raw === undefined || raw === null || raw === '') {
      continue;
    }
    entries.push({
      key: field.key,
      label: field.label || keyLabel(field.key),
      value: formatMetadataValue(field, raw),
    });
  }
  for (const [key, raw] of Object.entries(values)) {
    if (seen.has(key) || raw === undefined || raw === null || raw === '') {
      continue;
    }
    entries.push({ key, label: keyLabel(key), value: formatMetadataValue(null, raw) });
  }
  return entries;
}

/** Printing code (`AZR-EN001`), else `SET-number`, else the set code. */
export function printingCode(printing: PrintingSummary | null | undefined): string {
  if (!printing) {
    return '';
  }
  if (printing.printingCode) {
    return printing.printingCode;
  }
  if (printing.setCode && printing.collectorNumber) {
    return `${printing.setCode}-${printing.collectorNumber}`;
  }
  return printing.setCode ?? '';
}

/** Front picture of a printing (an API URL; the API serves placeholder art locally). */
export function printingImageUrl(printing: PrintingSummary | null | undefined): string | null {
  const images = printing?.images ?? [];
  return (images.find((image) => image.kind === 'FRONT') ?? images[0])?.url ?? null;
}

/** "1st Edition · English · Holo" for a printing (rarity first when it has one). */
export function printingFacts(printing: PrintingSummary): string {
  return [
    printing.rarity,
    editionLabel(printing.edition),
    languageName(printing.language),
    finishLabel(printing.finish),
  ]
    .filter((part) => part && part !== '—')
    .join(' · ');
}

/** Suggestions without duplicates (the same card or printing code listed twice). */
export function uniqueSuggestions(items: readonly CardSuggestion[]): CardSuggestion[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}|${item.id}|${item.printingCode ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** A search text bounded like the API's validation (trimmed, at most 100 characters). */
export function boundedQuery(value: string): string {
  return value.trim().slice(0, QUERY_MAX_LENGTH);
}
