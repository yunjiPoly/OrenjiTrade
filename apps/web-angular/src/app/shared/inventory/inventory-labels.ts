import type { PrintingSummary } from '@orenji/api-client';
import { formatRelativeTime, toDate } from '../pipes/relative-time.pipe';
import type { FreshnessState } from '../ui/freshness-badge/freshness';
import { CARD_CONDITIONS, CardCondition } from '../ui/condition-chip/card-condition';

/**
 * Display vocabulary of the inventory (Phase 3 contract): visibility, availability, binder kinds,
 * publication modes, temporary durations, freshness, prices and printings. Values mirror the
 * generated `@orenji/api-client` enums; labels live here so every screen words them the same way.
 */

/** Item and binder visibility (`PRIVATE | PUBLIC | TEMPORARILY_PUBLIC`). */
export type Visibility = 'PRIVATE' | 'PUBLIC' | 'TEMPORARILY_PUBLIC';

export const VISIBILITIES: readonly Visibility[] = ['PRIVATE', 'PUBLIC', 'TEMPORARILY_PUBLIC'];

export interface VisibilityInfo {
  label: string;
  /** Material Symbols glyph (design system: lock / globe / timer). */
  icon: string;
  hint: string;
}

export const VISIBILITY_INFO: Record<Visibility, VisibilityInfo> = {
  PRIVATE: { label: 'Private', icon: 'lock', hint: 'Only you can see it.' },
  PUBLIC: {
    label: 'Public',
    icon: 'public',
    hint: 'Collectors of your region can find it on the map and in search.',
  },
  TEMPORARILY_PUBLIC: {
    label: 'Temporarily public',
    icon: 'timer',
    hint: 'Public until the end you choose, then private again automatically.',
  },
};

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === 'string' && (VISIBILITIES as readonly string[]).includes(value);
}

/** What the owner does with an item (the API enum; "accepts offers" is a separate flag). */
export type InventoryAvailability =
  'COLLECTION_ONLY' | 'TRADE' | 'SALE' | 'TRADE_OR_SALE' | 'NOT_AVAILABLE';

export const INVENTORY_AVAILABILITIES: readonly InventoryAvailability[] = [
  'TRADE_OR_SALE',
  'TRADE',
  'SALE',
  'COLLECTION_ONLY',
  'NOT_AVAILABLE',
];

export function isInventoryAvailability(value: unknown): value is InventoryAvailability {
  return (
    typeof value === 'string' && (INVENTORY_AVAILABILITIES as readonly string[]).includes(value)
  );
}

export type BinderKind = 'COLLECTION' | 'TRADE' | 'SALE' | 'DECK' | 'CUSTOM';

export const BINDER_KINDS: readonly BinderKind[] = [
  'TRADE',
  'SALE',
  'COLLECTION',
  'DECK',
  'CUSTOM',
];

export const BINDER_KIND_INFO: Record<BinderKind, { label: string; icon: string }> = {
  COLLECTION: { label: 'Collection', icon: 'collections_bookmark' },
  TRADE: { label: 'Trade binder', icon: 'swap_horiz' },
  SALE: { label: 'For sale', icon: 'sell' },
  DECK: { label: 'Deck', icon: 'stacks' },
  CUSTOM: { label: 'Custom', icon: 'menu_book' },
};

export function binderKindLabel(kind: string | null | undefined): string {
  return BINDER_KIND_INFO[kind as BinderKind]?.label ?? 'Binder';
}

/** `POST /binders/{id}/publish` modes offered in the UI (PUBLIC is an alias of UNTIL_DISABLED). */
export type PublishMode = 'ONE_HOUR' | 'ONE_DAY' | 'UNTIL_DISABLED';

export interface PublishOption {
  mode: PublishMode;
  label: string;
  icon: string;
}

export const PUBLISH_OPTIONS: readonly PublishOption[] = [
  { mode: 'ONE_HOUR', label: 'Public for 1 hour', icon: 'timer' },
  { mode: 'ONE_DAY', label: 'Public for 24 hours', icon: 'timer' },
  { mode: 'UNTIL_DISABLED', label: 'Public until disabled', icon: 'public' },
];

/** Durations of a temporary publication (the API accepts at most 30 days ahead). */
export type TemporaryDuration = '1h' | '24h' | '3d' | '7d' | '30d';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Kept off `publicUntil` so a slightly fast client clock never crosses the 30-day bound. */
const SAFETY_MARGIN_MS = 5 * 60_000;

export const TEMPORARY_DURATIONS: readonly {
  value: TemporaryDuration;
  label: string;
  ms: number;
}[] = [
  { value: '1h', label: '1 hour', ms: HOUR_MS },
  { value: '24h', label: '24 hours', ms: DAY_MS },
  { value: '3d', label: '3 days', ms: 3 * DAY_MS },
  { value: '7d', label: '7 days', ms: 7 * DAY_MS },
  { value: '30d', label: '30 days', ms: 30 * DAY_MS - SAFETY_MARGIN_MS },
];

export const DEFAULT_TEMPORARY_DURATION: TemporaryDuration = '24h';

export function isTemporaryDuration(value: unknown): value is TemporaryDuration {
  return TEMPORARY_DURATIONS.some((option) => option.value === value);
}

/** ISO end of a temporary publication that starts now. */
export function publicUntilFor(
  duration: TemporaryDuration,
  now: Date | number = Date.now(),
): string {
  const start = typeof now === 'number' ? now : now.getTime();
  const option = TEMPORARY_DURATIONS.find((candidate) => candidate.value === duration);
  return new Date(start + (option?.ms ?? DAY_MS)).toISOString();
}

export function temporaryDurationLabel(duration: TemporaryDuration): string {
  return TEMPORARY_DURATIONS.find((option) => option.value === duration)?.label ?? duration;
}

/** "ends in 23 hours" / "ended 2 hours ago" for a publication end; `null` without one. */
export function endsLabel(
  until: string | null | undefined,
  now: Date | number = Date.now(),
): string | null {
  const date = toDate(until);
  if (!date) {
    return null;
  }
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const relative = formatRelativeTime(date, nowMs);
  return date.getTime() > nowMs ? `ends ${relative}` : `ended ${relative}`;
}

/** Freshness states of the API. */
export type ApiFreshnessState = 'ACTIVE' | 'AGING' | 'STALE' | 'HIDDEN';

export const API_FRESHNESS_STATES: readonly ApiFreshnessState[] = [
  'ACTIVE',
  'AGING',
  'STALE',
  'HIDDEN',
];

export const API_FRESHNESS_LABELS: Record<ApiFreshnessState, string> = {
  ACTIVE: 'Fresh',
  AGING: 'Aging',
  STALE: 'Stale',
  HIDDEN: 'Hidden until confirmed',
};

/** Maps an API freshness state to the badge palette (ACTIVE is "fresh"). */
export function badgeFreshness(state: string | null | undefined): FreshnessState {
  switch (state) {
    case 'ACTIVE':
      return 'fresh';
    case 'AGING':
      return 'aging';
    case 'STALE':
      return 'stale';
    default:
      return 'hidden';
  }
}

export function isCardCondition(value: unknown): value is CardCondition {
  return typeof value === 'string' && value in CARD_CONDITIONS;
}

/** Full condition label (`NEAR_MINT` -> `Near Mint`); readable fallback for unknown values. */
export function conditionLabel(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return isCardCondition(value)
    ? CARD_CONDITIONS[value].label
    : value
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase());
}

/** Currencies offered for asking prices (ISO 4217; CAD is the API default). */
export const CURRENCIES: readonly string[] = ['CAD', 'USD', 'EUR', 'GBP', 'JPY'];
export const DEFAULT_CURRENCY = 'CAD';

/** `CA$45.00`; `null` without an amount. */
export function formatPrice(
  amount: number | null | undefined,
  currency: string | null | undefined = DEFAULT_CURRENCY,
  locale = 'en-CA',
): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return null;
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || DEFAULT_CURRENCY,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ''}`.trim();
  }
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

/** Front picture of a printing (the API serves placeholder SVGs locally). */
export function printingImageUrl(printing: PrintingSummary | null | undefined): string | null {
  const images = printing?.images ?? [];
  return (images.find((image) => image.kind === 'FRONT') ?? images[0])?.url ?? null;
}
