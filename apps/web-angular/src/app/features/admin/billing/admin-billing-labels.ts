import { humanizeKey } from '../../../shared/plans/plan-labels';
import type { ChipTone } from '../shared/admin-chip.component';

/**
 * Admin wording, chip tones and form helpers of Phase 10 (plans, subscriptions, credits,
 * advertising, donations). Every value comes from the API; limits here mirror its validation.
 */

export const AD_PLACEMENTS = [
  'SEARCH_SPONSORED',
  'MAP_PANEL',
  'INVENTORY_SIDEBAR',
  'COLLECTOR_PROFILE',
  'MOBILE_FEED',
] as const;
export type AdPlacementKey = (typeof AD_PLACEMENTS)[number];

export const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED'] as const;
export const CREATIVE_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export const ADVERTISER_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export const PRICING_MODELS = ['CPM', 'CPC', 'FLAT'] as const;
export const TARGETING_KINDS = ['GAME', 'REGION', 'COUNTRY', 'SUBDIVISION', 'TAG', 'PLAN'] as const;
export const GRANT_REASONS = ['ADMIN', 'PROMO', 'REWARD', 'CORRECTION'] as const;

/** API bounds (`AdRequests`, `CreditRequests`, `UpdatePlanRequest`). */
export const LIMITS = {
  advertiserName: 120,
  campaignName: 120,
  headline: 80,
  body: 200,
  ctaLabel: 30,
  url: 500,
  targetingValue: 120,
  targetingRules: 50,
  grantAmount: 100_000,
  grantNote: 500,
  productName: 80,
  productDescription: 500,
  planName: 80,
  planDescription: 1000,
} as const;

const PLACEMENT_LABELS: Record<AdPlacementKey, string> = {
  SEARCH_SPONSORED: 'Search results',
  MAP_PANEL: 'Map panel',
  INVENTORY_SIDEBAR: 'Inventory sidebar',
  COLLECTOR_PROFILE: 'Collector profile',
  MOBILE_FEED: 'Mobile feed',
};

export function placementLabel(key: string | null | undefined): string {
  return PLACEMENT_LABELS[key as AdPlacementKey] ?? humanizeKey(key ?? '');
}

const TARGETING_LABELS: Record<string, { label: string; hint: string }> = {
  GAME: { label: 'Game', hint: 'A game slug, e.g. pokemon' },
  REGION: { label: 'Platform region', hint: 'americas-north, americas-south or europe' },
  COUNTRY: { label: 'Country', hint: 'An ISO 3166-1 alpha-2 code, e.g. CA' },
  SUBDIVISION: {
    label: 'State or province',
    hint: 'An ISO 3166-2 code, e.g. CA-QC (never a city or coordinates)',
  },
  TAG: { label: 'Tag', hint: 'A profile tag slug' },
  PLAN: { label: 'Plan', hint: 'FREE, PREMIUM or ANONYMOUS (signed-out visitors)' },
};

export function targetingLabel(kind: string | null | undefined): string {
  return TARGETING_LABELS[kind ?? '']?.label ?? humanizeKey(kind ?? '');
}

export function targetingHint(kind: string | null | undefined): string {
  return TARGETING_LABELS[kind ?? '']?.hint ?? '';
}

/**
 * Client-side check of a targeting value (the API validates too). Values that look like
 * coordinates are refused: geography is only ever a public label or grid cell (ADR 0004).
 */
export function targetingValueError(kind: string, value: string): string | null {
  const text = value.trim();
  if (!text) {
    return 'Enter a value.';
  }
  if (text.length > LIMITS.targetingValue) {
    return `Keep it under ${LIMITS.targetingValue} characters.`;
  }
  if (/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/.test(text)) {
    return 'Coordinates are never used for targeting: use a region, country or state code.';
  }
  switch (kind) {
    case 'GAME':
    case 'TAG':
      return /^[a-z0-9][a-z0-9-]{0,63}$/.test(text)
        ? null
        : 'Use a lower-case slug (letters, digits, dashes).';
    case 'REGION':
      return /^[a-z]+(-[a-z]+)*$/.test(text) ? null : 'Use a region code like americas-north.';
    case 'COUNTRY':
      return /^[A-Za-z]{2}$/.test(text) ? null : 'Use a two-letter country code like CA.';
    case 'SUBDIVISION':
      return /^[A-Za-z]{2}(-[A-Za-z0-9]{1,3})?$/.test(text)
        ? null
        : 'Use an ISO 3166-2 code like CA-QC.';
    case 'PLAN':
      return /^[A-Z_]{2,32}$/.test(text)
        ? null
        : 'Use a plan code like FREE, PREMIUM or ANONYMOUS.';
    default:
      return null;
  }
}

export function statusTone(status: string | null | undefined): ChipTone {
  switch (status) {
    case 'ACTIVE':
    case 'SUCCEEDED':
    case 'PROCESSED':
      return 'success';
    case 'TRIAL':
    case 'PENDING':
    case 'RECEIVED':
      return 'info';
    case 'PAUSED':
    case 'PAST_DUE':
    case 'DRAFT':
    case 'REFUNDED':
    case 'IGNORED':
      return 'warning';
    case 'FAILED':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** "PAST_DUE" → "Past due". */
export function statusText(status: string | null | undefined): string {
  return humanizeKey((status ?? '').toLowerCase());
}

/** `<input type="datetime-local">` value (local time) of an ISO instant, '' when absent. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** ISO instant of a `datetime-local` value, `null` when empty or invalid. */
export function fromLocalInput(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A money amount typed in a form ("12.50"); `null` when empty; `NaN` when invalid. */
export function parseMoney(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || `${value}`.trim() === '') {
    return null;
  }
  const text = `${value}`.trim().replace(',', '.');
  return /^\d{1,10}(\.\d{1,2})?$/.test(text) ? Number(text) : Number.NaN;
}

/** UUID check for the "user id" fields (grant credits, ledger filter). */
export function isUuid(value: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    (value ?? '').trim(),
  );
}
