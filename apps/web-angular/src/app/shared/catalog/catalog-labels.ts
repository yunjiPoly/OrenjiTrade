import type { GameMetadataField, MarketPrice } from '@orenji/api-client';

/**
 * Display wording for catalog enums. Values come from each game's `GameSchema`; unknown values
 * are shown readably instead of disappearing.
 */

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

/** `FIRST_EDITION` -> `First edition` for values without a curated label. */
export function titleCaseEnum(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase().trim();
  return words ? words[0].toUpperCase() + words.slice(1) : value;
}

export function editionLabel(value: string | null | undefined): string {
  return value ? (EDITION_LABELS[value] ?? titleCaseEnum(value)) : '—';
}

export function finishLabel(value: string | null | undefined): string {
  return value ? (FINISH_LABELS[value] ?? titleCaseEnum(value)) : '—';
}

let languageNames: Intl.DisplayNames | null | undefined;

/** ISO 639-1 code -> English language name (`fr` -> `French`); the code when unknown. */
export function languageLabel(code: string | null | undefined): string {
  if (!code) {
    return '—';
  }
  if (languageNames === undefined) {
    try {
      languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
    } catch {
      languageNames = null;
    }
  }
  const name = languageNames?.of(code);
  return name && name.toLowerCase() !== code.toLowerCase() ? name : code.toUpperCase();
}

/** Localised market price (`CA$42.00`), or `null` when the printing has none. */
export function formatMarketPrice(
  price: MarketPrice | null | undefined,
  locale = 'en-CA',
): string | null {
  if (!price || price.amount === undefined || price.amount === null) {
    return null;
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: price.currency || 'CAD',
    }).format(price.amount);
  } catch {
    return `${price.amount.toFixed(2)} ${price.currency ?? ''}`.trim();
  }
}

/** What a market price is and where it comes from, for its label and tooltip. */
export interface MarketPriceInfo {
  /** Short label: "TCG market price" for YGOPRODeck set prices. */
  label: string;
  /** Source and date, for a tooltip ("YGOPRODeck set price (TCGplayer-based, USD) · updated …"). */
  detail: string;
}

function priceDate(value: string | null | undefined, locale: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  } catch {
    return value.slice(0, 10);
  }
}

/**
 * The label and source of a market price: YGOPRODeck's `set_price` is TCGplayer-based USD (a "TCG
 * market price"); the local sample catalog's prices are fictional; staff-entered prices say so.
 */
export function marketPriceInfo(
  price: MarketPrice | null | undefined,
  locale = 'en-CA',
): MarketPriceInfo | null {
  if (!price || price.amount === undefined || price.amount === null) {
    return null;
  }
  const date = priceDate(price.updatedAt, locale);
  const dated = date ? ` · updated ${date}` : '';
  switch (price.source) {
    case 'YGOPRODECK':
      return {
        label: 'TCG market price',
        detail: `YGOPRODeck set price (TCGplayer-based, ${price.currency ?? 'USD'})${dated}`,
      };
    case 'SAMPLE':
      return {
        label: 'Sample market price',
        detail: `Fictional price of the local sample catalog${dated}`,
      };
    default:
      return { label: 'Market price', detail: `Set by OrenjiTrade${dated}` };
  }
}

/** A metadata value rendered according to its schema field type. */
export function formatMetadataValue(
  field: Pick<GameMetadataField, 'type'> | null,
  value: unknown,
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

/** Schema-ordered metadata entries (declared fields first, then undeclared keys). */
export interface MetadataEntry {
  key: string;
  label: string;
  value: string;
  /** List values for chips (`string_list`). */
  items: string[];
}

export function metadataEntries(
  fields: readonly GameMetadataField[] | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  options: { only?: readonly string[]; includeUndeclared?: boolean } = {},
): MetadataEntry[] {
  const values = metadata ?? {};
  const declared = fields ?? [];
  const entries: MetadataEntry[] = [];
  const seen = new Set<string>();
  const keys = options.only ?? declared.map((field) => field.key);
  for (const key of keys) {
    seen.add(key);
    const field = declared.find((candidate) => candidate.key === key) ?? null;
    const raw = values[key];
    if (raw === undefined || raw === null || raw === '') {
      continue;
    }
    entries.push({
      key,
      label: field?.label ?? titleCaseEnum(key.replace(/([a-z])([A-Z])/g, '$1_$2')),
      value: formatMetadataValue(field, raw),
      items: Array.isArray(raw) ? raw.map((item) => String(item)) : [],
    });
  }
  if (options.includeUndeclared) {
    for (const [key, raw] of Object.entries(values)) {
      if (seen.has(key) || raw === undefined || raw === null || raw === '') {
        continue;
      }
      entries.push({
        key,
        label: titleCaseEnum(key.replace(/([a-z])([A-Z])/g, '$1_$2')),
        value: formatMetadataValue(null, raw),
        items: Array.isArray(raw) ? raw.map((item) => String(item)) : [],
      });
    }
  }
  return entries;
}
