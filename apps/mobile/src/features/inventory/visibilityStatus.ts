import type {
  BinderResponse,
  InventoryItemResponse,
  PrivacySettings,
  Visibility,
} from '@/src/api/types';
import { endsLabel, VISIBILITY_INFO } from '@/src/lib/inventory';

import type { CardVisibility } from './cardForm';
import { CARD_FORM_COPY } from './inventoryCopy';

/**
 * How an item or binder shows to other collectors, worded for its owner (mirror of the web's
 * `features/inventory/data/visibility-status.ts`). The API computes `effectivePublic`; this
 * explains why something set to public is not visible yet.
 */
export interface VisibilityStatus {
  visibility: Visibility;
  /** Set to public (or temporarily public) but nobody can see it right now. */
  pending: boolean;
  label: string;
  note: string;
}

/**
 * Whether other collectors can see the owner's public listings at all (ADR 0004): discoverable or
 * a PUBLIC profile, never a PRIVATE profile. `null` while the privacy settings are unknown.
 */
export function ownerIsVisible(privacy: PrivacySettings | null | undefined): boolean | null {
  if (!privacy) {
    return null;
  }
  return (
    (privacy.discoverable || privacy.profileVisibility === 'PUBLIC') &&
    privacy.profileVisibility !== 'PRIVATE'
  );
}

/**
 * A deck core buyers see right now (public, unsold, its owner's listings public: the API's
 * `effectivePublic` of a binder with "Sell as a deck core" on). Every live card filed in it is
 * one of its key cards, whatever the card's own visibility (the API's `IN_PUBLIC_CORE`, stage R3).
 */
export function shownAsDeckCore(
  binder: Partial<Pick<BinderResponse, 'sellsAsCore' | 'effectivePublic' | 'soldAt'>> | null
): boolean {
  return (
    !!binder && binder.sellsAsCore === true && binder.effectivePublic === true && !binder.soldAt
  );
}

const OWNER_HIDDEN_NOTE =
  'You are hidden from the map and your profile is not public, so nobody can see it yet.';

function publicLabel(visibility: Visibility, publicUntil: string | null | undefined, now: number) {
  if (visibility === 'TEMPORARILY_PUBLIC') {
    const ends = endsLabel(publicUntil, now);
    return ends ? `Public · ${ends}` : VISIBILITY_INFO.TEMPORARILY_PUBLIC.label;
  }
  return VISIBILITY_INFO.PUBLIC.label;
}

/** Explains the effective visibility of an item. */
export function itemVisibilityStatus(
  item: Pick<
    InventoryItemResponse,
    'visibility' | 'publicUntil' | 'effectivePublic' | 'freshness' | 'binder'
  >,
  context: { binder?: BinderResponse | null; ownerVisible?: boolean | null; now?: number } = {}
): VisibilityStatus {
  const visibility = item.visibility;
  const now = context.now ?? Date.now();
  if (visibility === 'PRIVATE') {
    const binder = context.binder ?? null;
    const keyCard = binder && shownAsDeckCore(binder) && item.freshness.state !== 'HIDDEN';
    return {
      visibility,
      pending: false,
      label: 'Private',
      note: keyCard ? CARD_FORM_COPY.privateInCoreHint(binder.name) : 'Only you can see this card.',
    };
  }
  const label = publicLabel(visibility, item.publicUntil, now);
  if (item.effectivePublic) {
    return {
      visibility,
      pending: false,
      label,
      note: 'Collectors of your region can see this card.',
    };
  }
  const binder = context.binder ?? null;
  let note = 'Not visible to other collectors right now.';
  if (item.freshness.state === 'HIDDEN') {
    note = 'Hidden until you confirm it is still available.';
  } else if (
    visibility === 'TEMPORARILY_PUBLIC' &&
    item.publicUntil &&
    Date.parse(item.publicUntil) <= now
  ) {
    note = 'The temporary publication has ended.';
  } else if (binder && binder.visibility === 'PRIVATE') {
    note = `Its binder “${binder.name}” is private. Publish the binder to show it.`;
  } else if (binder && !binder.effectivePublic && context.ownerVisible !== false) {
    note = `Its binder “${binder.name}” is not public right now.`;
  } else if (context.ownerVisible === false) {
    note = OWNER_HIDDEN_NOTE;
  }
  return { visibility, pending: true, label: `${label} · not visible`, note };
}

/** Explains the effective visibility of a binder. */
export function binderVisibilityStatus(
  binder: Pick<BinderResponse, 'visibility' | 'publicUntil' | 'effectivePublic' | 'freshness'>,
  context: { ownerVisible?: boolean | null; now?: number } = {}
): VisibilityStatus {
  const visibility = binder.visibility;
  const now = context.now ?? Date.now();
  if (visibility === 'PRIVATE') {
    return {
      visibility,
      pending: false,
      label: 'Private',
      note: 'Only you can see this binder and its cards.',
    };
  }
  const label = publicLabel(visibility, binder.publicUntil, now);
  if (binder.effectivePublic) {
    return {
      visibility,
      pending: false,
      label,
      note: 'Collectors can open this binder and see its public cards.',
    };
  }
  let note = 'Not visible to other collectors right now.';
  if (context.ownerVisible === false) {
    note = OWNER_HIDDEN_NOTE;
  } else if (binder.freshness.state === 'HIDDEN') {
    note = 'Hidden until you confirm it is still available.';
  } else if (binder.publicUntil && Date.parse(binder.publicUntil) <= now) {
    note = 'The temporary publication has ended.';
  }
  return { visibility, pending: true, label: `${label} · not visible`, note };
}

/**
 * What the card form knows about its owner for the "Who can see it" hint (review fix 1 of stage
 * R2). Discovery needs a declared location, "Show me on the map", a profile that is not private
 * and no pause of the owner's public cards (the API's `DiscoverySql.DISCOVERABLE` and
 * `PublicVisibilityRules.OWNER_LISTINGS_PUBLIC`). `null` while unknown.
 */
export interface CardFindability {
  /** The region of the declared location ("Americas (North)"); null without a location. */
  regionName: string | null;
  /** Whether a location is declared; null while unknown. */
  located: boolean | null;
  /** "Show me on the map"; null while unknown. */
  discoverable: boolean | null;
  /** A PRIVATE profile; null while unknown. */
  privateProfile: boolean | null;
  /** The owner's public cards are paused; null while unknown. */
  paused: boolean | null;
}

/** Nothing known yet: the hint stays the spec's until the settings have loaded. */
export const UNKNOWN_FINDABILITY: CardFindability = {
  regionName: null,
  located: null,
  discoverable: null,
  privateProfile: null,
  paused: null,
};

/** Whether a binder itself shows its public cards (visibility, end of a publication, freshness). */
export function binderShowsCards(
  binder: Pick<BinderResponse, 'visibility' | 'publicUntil' | 'freshness'>,
  now = Date.now()
): boolean {
  const visible =
    binder.visibility === 'PUBLIC' ||
    (binder.visibility === 'TEMPORARILY_PUBLIC' &&
      !!binder.publicUntil &&
      Date.parse(binder.publicUntil) > now);
  return visible && binder.freshness.state !== 'HIDDEN';
}

/**
 * A temporary publication (set on the paused web) whose end has passed, or that has none: nobody
 * sees the card (the API's `effectivePublic` rule).
 */
export function temporaryPublicationEnded(
  item: Pick<InventoryItemResponse, 'visibility' | 'publicUntil'>,
  now = Date.now()
): boolean {
  return (
    item.visibility === 'TEMPORARILY_PUBLIC' &&
    !(item.publicUntil && Date.parse(item.publicUntil) > now)
  );
}

/**
 * Edit card's card as saved, for the hint under "Who can see it" (review fix 2 of stage R2): the
 * hint of a public card also depends on the card itself (hidden until confirmed, a temporary
 * publication that ended), and on whether "Save changes" is pending (a save confirms the card and
 * saves the visibility the form shows).
 */
export interface SavedCardState {
  item: Pick<InventoryItemResponse, 'visibility' | 'publicUntil' | 'freshness' | 'effectivePublic'>;
  /** Something changed (the form or the photos): "Save changes" is on. */
  changed: boolean;
}

/**
 * The hint under "Who can see it" of Add to inventory and Edit card. A private card filed in a
 * deck core buyers see says that they see it as one of the core's key cards (review fix 2 of
 * stage R3), unless it is hidden until confirmed and nothing changed.
 */
export function cardVisibilityHint(
  visibility: CardVisibility,
  owner: CardFindability,
  binder:
    | (Pick<BinderResponse, 'name' | 'visibility' | 'publicUntil' | 'freshness'> &
        Partial<Pick<BinderResponse, 'sellsAsCore' | 'effectivePublic' | 'soldAt'>>)
    | null,
  saved: SavedCardState | null = null,
  now = Date.now()
): { findable: boolean; text: string } {
  if (visibility === 'PRIVATE') {
    const hidden = saved && !saved.changed && saved.item.freshness.state === 'HIDDEN';
    if (binder && shownAsDeckCore(binder) && !hidden) {
      return { findable: true, text: CARD_FORM_COPY.privateInCoreHint(binder.name) };
    }
    const ended = saved && !saved.changed && temporaryPublicationEnded(saved.item, now);
    return {
      findable: true,
      text: ended ? CARD_FORM_COPY.privateHintEnded : CARD_FORM_COPY.privateHint,
    };
  }
  return publicCardHint(owner, binder, now, saved);
}

/**
 * The hint under "Who can see it" for a card set to Public (spec section 6, screen 6): "Collectors
 * in {region} can find it." only when they really can, otherwise why nobody can: no location,
 * hidden from the map, a private profile, paused public cards, or a binder that is private or not
 * public right now. `findable` is false only for a known reason. On Edit card (`saved`), a card
 * nobody can find now says so while nothing changed (hidden until confirmed, or not right now),
 * and that collectors can find it once "Save changes" is pressed otherwise.
 */
export function publicCardHint(
  owner: CardFindability,
  binder: Pick<BinderResponse, 'name' | 'visibility' | 'publicUntil' | 'freshness'> | null,
  now = Date.now(),
  saved: SavedCardState | null = null
): { findable: boolean; text: string } {
  const blocked = (text: string) => ({ findable: false, text });
  if (owner.located === false) {
    return blocked(CARD_FORM_COPY.notFoundNoLocation);
  }
  if (owner.privateProfile === true) {
    return blocked(CARD_FORM_COPY.notFoundPrivateProfile);
  }
  if (owner.discoverable === false) {
    return blocked(CARD_FORM_COPY.notFoundHidden);
  }
  if (owner.paused === true) {
    return blocked(CARD_FORM_COPY.notFoundPaused);
  }
  if (binder && binder.visibility === 'PRIVATE') {
    return blocked(CARD_FORM_COPY.notFoundBinderPrivate(binder.name));
  }
  if (binder && !binderShowsCards(binder, now)) {
    return blocked(CARD_FORM_COPY.notFoundBinderOff(binder.name));
  }
  if (saved && !saved.item.effectivePublic) {
    if (!saved.changed) {
      return blocked(
        saved.item.freshness.state === 'HIDDEN'
          ? CARD_FORM_COPY.notFoundUntilConfirmed
          : CARD_FORM_COPY.notFoundNow
      );
    }
    return {
      findable: true,
      text: owner.regionName
        ? CARD_FORM_COPY.publicHintOnSave(owner.regionName)
        : CARD_FORM_COPY.publicHintOnSaveNoRegion,
    };
  }
  return {
    findable: true,
    text: owner.regionName
      ? CARD_FORM_COPY.publicHint(owner.regionName)
      : CARD_FORM_COPY.publicHintNoRegion,
  };
}
