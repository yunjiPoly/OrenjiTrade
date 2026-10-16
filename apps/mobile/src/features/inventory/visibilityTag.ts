import type { InventoryItemResponse } from '@/src/api/types';
import type { Palette } from '@/src/theme';

import { itemVisibilityStatus } from './visibilityStatus';

/**
 * The tag after the card code on each Inventory row (owner change of 2026-10-16, mockup v43,
 * screens 1, 8 and 9): who can see the card.
 */
export type VisibilityTagKind = 'private' | 'public' | 'pending';

export interface VisibilityTag {
  kind: VisibilityTagKind;
  /** "Private", "Public", or the short label of a public card nobody can see yet. */
  label: string;
  /** The label as a screen reader says it inside the row's name ("Public, not visible"). */
  spoken: string;
  icon: 'lock-outline' | 'earth' | 'eye-off-outline';
}

/**
 * The tag of a card, from `itemVisibilityStatus`: Private (a lock), Public (a globe), or, for a
 * card set to Public that nobody can see yet (the profile is not discoverable, a private binder,
 * hidden until confirmed, a temporary publication that ended), that status's short label ("Public
 * · not visible") so the owner sees why it is not shown.
 */
export function itemVisibilityTag(
  item: Pick<
    InventoryItemResponse,
    'visibility' | 'publicUntil' | 'effectivePublic' | 'freshness' | 'binder'
  >,
  now = Date.now()
): VisibilityTag {
  const status = itemVisibilityStatus(item, { now });
  const kind: VisibilityTagKind =
    status.visibility === 'PRIVATE' ? 'private' : status.pending ? 'pending' : 'public';
  return {
    kind,
    label: status.label,
    spoken: status.label.split(' · ').join(', '),
    icon: kind === 'private' ? 'lock-outline' : kind === 'public' ? 'earth' : 'eye-off-outline',
  };
}

function channels(hex: string): [number, number, number] {
  const digits = hex.replace('#', '');
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits.slice(0, 6);
  return [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** `top` laid over `bottom` at `amount` (0 to 1), as one solid colour ("#20352F"). */
export function mixColors(top: string, bottom: string, amount: number): string {
  const over = channels(top);
  const under = channels(bottom);
  return `#${over
    .map((channel, index) =>
      Math.round(channel * amount + (under[index] ?? 0) * (1 - amount))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`.toUpperCase();
}

/**
 * The tag's colours on the row's surface. Private: the muted text on the raised surface. Public:
 * the teal of the list's "Select" on a faint teal (the mockup's 14 % in the dark theme, 10 % in the
 * light one, where 14 % leaves the teal text under 4.5 : 1). A card nobody can see yet: amber, the
 * amber text on a faint amber in the dark theme, the ink on a faint amber in the light one (the
 * light theme's amber is too pale for small text).
 */
export function visibilityTagColors(
  kind: VisibilityTagKind,
  palette: Palette
): { background: string; color: string } {
  const dark = palette.scheme === 'dark';
  if (kind === 'public') {
    return {
      background: mixColors(palette.accent, palette.surface, dark ? 0.14 : 0.1),
      color: palette.accent,
    };
  }
  if (kind === 'pending') {
    return {
      background: mixColors(palette.warning, palette.surface, dark ? 0.14 : 0.18),
      color: dark ? palette.warning : palette.ink,
    };
  }
  return { background: palette.surfaceVariant, color: palette.textMuted };
}
