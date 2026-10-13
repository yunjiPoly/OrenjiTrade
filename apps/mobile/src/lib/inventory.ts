import type {
  BinderKind,
  FreshnessState,
  InventoryAvailability,
  PublishMode,
  Visibility,
} from '@/src/api/types';

import { relativeTime } from './relativeTime';

/**
 * Display vocabulary of the inventory (Phase 3 contract, mirror of the web's
 * `shared/inventory/inventory-labels.ts` and `shared/ui/availability-chip/availability.ts`):
 * visibility, availability, binder kinds, publication modes, temporary durations, freshness,
 * conditions and currencies. Values are the generated API enums; the wording lives here so every
 * screen words them the same way.
 */

export const VISIBILITIES: readonly Visibility[] = ['PRIVATE', 'PUBLIC', 'TEMPORARILY_PUBLIC'];

export const VISIBILITY_INFO: Record<Visibility, { label: string; hint: string }> = {
  PRIVATE: { label: 'Private', hint: 'Only you can see it.' },
  PUBLIC: {
    label: 'Public',
    hint: 'Collectors of your region can find it on the map and in search.',
  },
  TEMPORARILY_PUBLIC: {
    label: 'Temporarily public',
    hint: 'Public until the end you choose, then private again automatically.',
  },
};

/**
 * What the owner does with a card. The API models the trade / sell intents as one
 * `availability` value and "accepts offers" as a separate flag; wanting a card is a wishlist
 * entry, not an inventory item.
 */
export const AVAILABILITIES: readonly InventoryAvailability[] = [
  'TRADE_OR_SALE',
  'TRADE',
  'SALE',
  'COLLECTION_ONLY',
  'NOT_AVAILABLE',
];

export const AVAILABILITY_LABELS: Record<InventoryAvailability, string> = {
  TRADE_OR_SALE: 'Trade or sale',
  TRADE: 'Trade',
  SALE: 'Sale',
  COLLECTION_ONLY: 'Collection only',
  NOT_AVAILABLE: 'Not available',
};

export function availabilityLabel(value: string | null | undefined): string {
  return AVAILABILITY_LABELS[value as InventoryAvailability] ?? 'Unknown';
}

export const BINDER_KINDS: readonly BinderKind[] = [
  'TRADE',
  'SALE',
  'COLLECTION',
  'DECK',
  'CUSTOM',
];

export const BINDER_KIND_LABELS: Record<BinderKind, string> = {
  COLLECTION: 'Collection',
  TRADE: 'Trade binder',
  SALE: 'For sale',
  DECK: 'Deck',
  CUSTOM: 'Custom',
};

export function binderKindLabel(kind: string | null | undefined): string {
  return BINDER_KIND_LABELS[kind as BinderKind] ?? 'Binder';
}

/** `POST /binders/{id}/publish` modes offered in the app (PUBLIC is an alias of UNTIL_DISABLED). */
export const PUBLISH_OPTIONS: readonly { mode: PublishMode; label: string }[] = [
  { mode: 'ONE_HOUR', label: 'Public for 1 hour' },
  { mode: 'ONE_DAY', label: 'Public for 24 hours' },
  { mode: 'UNTIL_DISABLED', label: 'Public until disabled' },
];

/** Wording of a successful publication (web: `publishedMessage`). */
export function publishedMessage(name: string, mode: PublishMode): string {
  switch (mode) {
    case 'ONE_HOUR':
      return `“${name}” is public for 1 hour.`;
    case 'ONE_DAY':
      return `“${name}” is public for 24 hours.`;
    default:
      return `“${name}” is public until you make it private.`;
  }
}

/** Durations of a temporary publication (the API accepts at most 30 days ahead). */
export type TemporaryDuration = '1h' | '24h' | '3d' | '7d' | '30d';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Kept off `publicUntil` so a slightly fast device clock never crosses the 30-day bound. */
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

/** ISO end of a temporary publication that starts now. */
export function publicUntilFor(duration: TemporaryDuration, now: number = Date.now()): string {
  const option = TEMPORARY_DURATIONS.find((candidate) => candidate.value === duration);
  return new Date(now + (option?.ms ?? DAY_MS)).toISOString();
}

/** "ends in 23 hours" / "ended 2 hours ago" for a publication end; `null` without one. */
export function endsLabel(
  until: string | null | undefined,
  now: number = Date.now()
): string | null {
  if (!until) {
    return null;
  }
  const end = Date.parse(until);
  if (Number.isNaN(end)) {
    return null;
  }
  const relative = relativeTime(end, now);
  return end > now ? `ends ${relative}` : `ended ${relative}`;
}

export const FRESHNESS_STATES: readonly FreshnessState[] = ['ACTIVE', 'AGING', 'STALE', 'HIDDEN'];

export const FRESHNESS_LABELS: Record<FreshnessState, string> = {
  ACTIVE: 'Fresh',
  AGING: 'Aging',
  STALE: 'Stale',
  HIDDEN: 'Hidden until confirmed',
};

/** The design system's freshness badge for an API freshness state (ACTIVE is "fresh"). */
export function badgeFreshness(
  state: string | null | undefined
): 'FRESH' | 'AGING' | 'STALE' | 'HIDDEN' {
  switch (state) {
    case 'ACTIVE':
      return 'FRESH';
    case 'AGING':
      return 'AGING';
    case 'STALE':
      return 'STALE';
    default:
      return 'HIDDEN';
  }
}

/** A listing the owner should confirm (stale listings stay public, hidden ones do not). */
export function needsConfirmation(state: string | null | undefined): boolean {
  return state === 'STALE' || state === 'HIDDEN';
}

export const CARD_CONDITIONS = [
  'MINT',
  'NEAR_MINT',
  'LIGHTLY_PLAYED',
  'MODERATELY_PLAYED',
  'HEAVILY_PLAYED',
  'DAMAGED',
] as const;

export type KnownCondition = (typeof CARD_CONDITIONS)[number];

const CONDITION_LABELS: Record<KnownCondition, string> = {
  MINT: 'Mint',
  NEAR_MINT: 'Near Mint',
  LIGHTLY_PLAYED: 'Lightly Played',
  MODERATELY_PLAYED: 'Moderately Played',
  HEAVILY_PLAYED: 'Heavily Played',
  DAMAGED: 'Damaged',
};

export function isKnownCondition(value: unknown): value is KnownCondition {
  return typeof value === 'string' && value in CONDITION_LABELS;
}

/** Full condition label (`NEAR_MINT` -> `Near Mint`); readable fallback for unknown values. */
export function conditionLabel(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  if (isKnownCondition(value)) {
    return CONDITION_LABELS[value];
  }
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.replace(/^\w/, (c) => c.toUpperCase());
}

/** Currencies offered for asking prices (ISO 4217; CAD is the API default). */
export const CURRENCIES: readonly string[] = ['CAD', 'USD', 'EUR', 'GBP', 'JPY'];
export const DEFAULT_CURRENCY = 'CAD';

/** "3 cards" / "1 card". */
export function cardCount(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'}`;
}
