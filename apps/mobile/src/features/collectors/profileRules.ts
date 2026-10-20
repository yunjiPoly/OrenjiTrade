import type {
  CollectorProfileResponse,
  InventoryItemResponse,
  PrintingSummary,
  PrivacySettings,
} from '@/src/api/types';
import { gameLabel } from '@/src/lib/profile';

import { PROFILE_COPY } from './profileCopy';

/**
 * The pure rules of the profile pages (owner spec 2026-10-14, sections 3, 9 and 10; ADR 0017):
 * the line under the header, the chips beside the avatar, "I have it"'s choice of your copy, the
 * link a "Share profile" sends.
 */

/** The public address of a profile (the web's `/collectors/:handle`, a universal link). */
export const PROFILE_WEB_ORIGIN = 'https://www.orenjitrade.com';

export function profileUrl(handle: string): string {
  return `${PROFILE_WEB_ORIGIN}/collectors/${encodeURIComponent(handle)}`;
}

/**
 * "Laval, Quebec" (the city only while its owner shows it: the API sends it then, and only on this
 * profile) or "Quebec": the state or province without the country, as the mockup's line has it.
 */
export function profilePlace(
  location: CollectorProfileResponse['location'] | null | undefined
): string | null {
  if (!location) {
    return null;
  }
  const province = location.subdivisionName?.trim() || location.label;
  const city = location.city?.trim();
  return city ? `${city}, ${province}` : province;
}

/**
 * "Active this week" or "Active this month", nothing finer and nothing older (owner spec, section
 * 9): today counts as this week; a while ago, or hidden by the collector, says nothing.
 */
export function activeLabel(bucket: CollectorProfileResponse['lastActiveBucket']): string | null {
  switch (bucket) {
    case 'TODAY':
    case 'THIS_WEEK':
      return PROFILE_COPY.activeThisWeek;
    case 'THIS_MONTH':
      return PROFILE_COPY.activeThisMonth;
    default:
      return null;
  }
}

/** The year of "Member since {year}" (`memberSince` is a date, `2024-03-01`). */
export function memberYear(memberSince: string): string {
  const year = /^(\d{4})/.exec(memberSince)?.[1];
  return year ?? memberSince;
}

export interface ProfileLineParts {
  /** "{city, }{province}", or null without a public place. */
  place: string | null;
  member: string;
  /** Another collector's last activity, never yours (you are here). */
  active: string | null;
}

/** The parts of the one small line under the header: place · member since · active. */
export function profileLine(profile: CollectorProfileResponse, own: boolean): ProfileLineParts {
  return {
    place: profilePlace(profile.location),
    member: PROFILE_COPY.memberSince(memberYear(profile.memberSince)),
    active: own ? null : activeLabel(profile.lastActiveBucket),
  };
}

export interface ProfileChip {
  label: string;
  kind: 'game' | 'tag';
}

const comparable = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * The chips beside the avatar: the games first (orange), then the tags; a game tag that only
 * repeats one of the games ("Yu-Gi-Oh" beside "Yu-Gi-Oh!") is left out.
 */
export function profileChips(
  games: readonly string[],
  tags: readonly { slug: string; label: string }[]
): ProfileChip[] {
  const gameChips = games.map((game) => ({ label: gameLabel(game), kind: 'game' as const }));
  const taken = new Set(gameChips.map((chip) => comparable(chip.label)));
  const tagChips: ProfileChip[] = [];
  for (const tag of tags) {
    const key = comparable(tag.label);
    if (!taken.has(key)) {
      taken.add(key);
      tagChips.push({ label: tag.label, kind: 'tag' });
    }
  }
  return [...gameChips, ...tagChips];
}

/** "4.9": one decimal, or null before the first rating. */
export function ratingText(rating: CollectorProfileResponse['rating']): string | null {
  if (!rating || rating.count <= 0 || rating.average === null || rating.average === undefined) {
    return null;
  }
  return rating.average.toFixed(1);
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** "Sep 2026": the month of a reference, as the mockup writes it. */
export function referenceMonth(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * A profile's binders as Inventory › Binders orders them (owner spec, section 7: "Deck cores
 * first"): the deck cores, then the other binders, each group in its owner's order.
 */
export function deckCoresFirst<T extends { sellsAsCore?: boolean | null }>(
  binders: readonly T[]
): T[] {
  return [
    ...binders.filter((binder) => binder.sellsAsCore),
    ...binders.filter((binder) => !binder.sellsAsCore),
  ];
}

/** Why nobody else sees your cards and binders, whatever their own visibility. */
export type UnseenReason = 'not-on-map' | 'private';

/**
 * Why others see none of your cards and binders (the API's rule for a collector's listings:
 * listed while discoverable or with a PUBLIC profile, never with a PRIVATE one), or null while
 * they can see the public ones. Your own page then says how to change that instead of "Make
 * cards public", which they already may be (stage R6, review fix 1).
 */
export function ownUnseenReason(
  privacy: Pick<PrivacySettings, 'discoverable' | 'profileVisibility'> | null | undefined
): UnseenReason | null {
  if (!privacy) {
    return null;
  }
  if (privacy.profileVisibility === 'PRIVATE') {
    return 'private';
  }
  return privacy.discoverable || privacy.profileVisibility === 'PUBLIC' ? null : 'not-on-map';
}

/** What a wish asks for, as "I have it" compares it with your copies. */
export interface WishTarget {
  cardId: string;
  cardName: string;
  printing?: Pick<PrintingSummary, 'id' | 'rarity'> | null;
  rarity?: string | null;
}

/**
 * Your copy that answers a wish (owner spec, section 10: "If your inventory holds that card, it
 * becomes the chat's card"): the wished printing first, then the wished rarity, then any printing
 * of the card; a public copy before a private one, then the newest. Never a copy filed in one of
 * your deck cores (`deckCoreIds`): it sells only with its core (section 7). Null when you hold none.
 */
export function matchingItem(
  items: readonly InventoryItemResponse[],
  wish: WishTarget,
  deckCoreIds: ReadonlySet<string> = new Set()
): InventoryItemResponse | null {
  const ofCard = items.filter(
    (item) =>
      item.card?.id === wish.cardId &&
      item.quantity > 0 &&
      !(item.binder?.id && deckCoreIds.has(item.binder.id))
  );
  if (ofCard.length === 0) {
    return null;
  }
  const fit = (item: InventoryItemResponse): number => {
    if (wish.printing?.id && item.printing?.id === wish.printing.id) {
      return 0;
    }
    const rarity = wish.printing?.rarity ?? wish.rarity ?? null;
    if (rarity && item.printing?.rarity === rarity) {
      return 1;
    }
    return 2;
  };
  const visible = (item: InventoryItemResponse) => (item.visibility === 'PRIVATE' ? 1 : 0);
  const sorted = [...ofCard].sort(
    (a, b) =>
      fit(a) - fit(b) ||
      visible(a) - visible(b) ||
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  );
  return sorted[0] ?? null;
}
