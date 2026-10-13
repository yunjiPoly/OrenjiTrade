import type {
  BinderResponse,
  InventoryItemResponse,
  PrivacySettings,
  Visibility,
} from '@/src/api/types';
import { endsLabel, VISIBILITY_INFO } from '@/src/lib/inventory';

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
    return { visibility, pending: false, label: 'Private', note: 'Only you can see this card.' };
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
