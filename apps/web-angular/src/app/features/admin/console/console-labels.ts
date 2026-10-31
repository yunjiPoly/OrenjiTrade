import type { ModerationFlag } from '@orenji/api-client';
import { ALL_GAMES } from '../../../shared/domain/games';
import { PLATFORM_REGION_NAMES } from '../../../shared/regions/regions.store';

/** "QC" for "Quick Flip", "QU" for "@quickflip". */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '')
    .replace(/^@/, '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

const CONTEXT_PHRASES: Readonly<Record<string, string>> = {
  CONVERSATION: 'from a conversation',
  POST: 'from a community post',
  BINDER: 'from a public binder',
  PROFILE: 'from a profile',
};

/** "from a conversation": where a report was filed, as a row reads it. */
export function contextPhrase(source: string | null | undefined): string {
  return source ? (CONTEXT_PHRASES[source] ?? '') : '';
}

/** A platform region's name ("Americas (North)"), never its code; `null` when unknown. */
export function regionName(code: string | null | undefined): string | null {
  return code ? (PLATFORM_REGION_NAMES[code] ?? null) : null;
}

/** A game's name ("Yu-Gi-Oh!"), never its slug; `null` when unknown. */
export function gameName(slug: string | null | undefined): string | null {
  return ALL_GAMES.find((game) => game.slug === slug)?.label ?? null;
}

/** The console's chip class of a tone of `report-tones.ts`. */
export function chipClass(tone: string): string {
  return tone === 'neutral' ? 'cp-chip' : `cp-chip cp-chip--${tone}`;
}

/**
 * A room's name from its slug ("americas-north-yugioh" reads "Americas (North) · Yu-Gi-Oh!"),
 * never the slug; an older channel reads "An archived channel".
 */
export function roomNameOfSlug(slug: string | null | undefined): string {
  if (slug) {
    for (const code of Object.keys(PLATFORM_REGION_NAMES)) {
      if (slug.startsWith(`${code}-`)) {
        const game = gameName(slug.slice(code.length + 1));
        if (game) {
          return `${PLATFORM_REGION_NAMES[code]} · ${game}`;
        }
      }
    }
  }
  return 'An archived channel';
}

const MESSAGE_KINDS: Readonly<Record<string, string>> = {
  TEXT: 'Message',
  CARD_LINK: 'Card shared',
  BINDER_LINK: 'Binder shared',
  OFFER_LINK: 'Offer (old)',
  IMAGE: 'Photo',
  SYSTEM: 'From OrenjiTrade',
};

/** A message kind as words ("Card shared"), never its code. */
export function messageKindLabel(kind: string): string {
  return MESSAGE_KINDS[kind] ?? 'Message';
}

/** A moderation state of a message as words. */
export function moderationStateLabel(state: string): string {
  return state === 'FLAGGED' ? 'Flagged' : state === 'REMOVED' ? 'Removed' : 'Visible';
}

/** The line that stands for a detail staff never read (spec 15.4). */
export function sharedDetailLine(detail: string | null | undefined): string | null {
  if (detail === 'SHIPPING_ADDRESS') {
    return 'Shipping address shared · hidden from staff';
  }
  return detail === 'ETRANSFER_EMAIL' ? 'e-Transfer email shared · hidden from staff' : null;
}

/**
 * "Americas (North) · Yu-Gi-Oh!": a flagged post's room, never its codes. A channel that is not a
 * platform region's room (one from before the rooms; the API names no channel of a city) reads
 * "An archived channel · Yu-Gi-Oh!".
 */
export function flagRoomLine(flag: Pick<ModerationFlag, 'community'>): string | null {
  const content = flag.community;
  if (!content) {
    return null;
  }
  const game = gameName(content.game);
  if (!content.regionCode) {
    return ['An archived channel', game].filter((part): part is string => !!part).join(' · ');
  }
  return [regionName(content.regionCode), game ?? content.roomName]
    .filter((part): part is string => !!part)
    .join(' · ');
}
