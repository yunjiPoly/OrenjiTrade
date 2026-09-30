import type {
  RatingBreakdown,
  RatingEligibility,
  RatingEligibilityInteraction,
  RatingResponse,
  RatingSummaryResponse,
} from '@orenji/api-client';
import { ApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';

/** Optional criteria of a rating (Phase 7 contract), in display order. */
export type RatingCriterion = keyof RatingBreakdown & keyof RatingSummaryResponse;

export interface RatingCriterionInfo {
  key: RatingCriterion;
  label: string;
  /** Short hint shown under the stars in the rating dialog. */
  hint: string;
}

export const RATING_CRITERIA: readonly RatingCriterionInfo[] = [
  { key: 'communication', label: 'Communication', hint: 'Clear, timely and friendly answers' },
  {
    key: 'conditionAccuracy',
    label: 'Card condition',
    hint: 'Cards matched the condition described',
  },
  { key: 'shipping', label: 'Shipping', hint: 'Well packed and sent on time' },
  {
    key: 'meetupReliability',
    label: 'Meetup reliability',
    hint: 'On time at the agreed place',
  },
];

/** Longest rating comment (contract: ≤ 600) and reference (≤ 400). */
export const RATING_COMMENT_MAX = 600;
export const REFERENCE_MAX = 400;

/** Ratings can be edited for 14 days (`editableUntil`). */
export const RATING_EDIT_DAYS = 14;

export const INTERACTION_KIND_LABELS: Record<string, string> = {
  TRADE: 'Completed trade',
  OFFER_ACCEPTED: 'Accepted offer',
  CONVERSATION_QUALIFIED: 'Conversation',
};

export const INTERACTION_KIND_ICONS: Record<string, string> = {
  TRADE: 'handshake',
  OFFER_ACCEPTED: 'local_offer',
  CONVERSATION_QUALIFIED: 'forum',
};

export function interactionKindLabel(kind: string | null | undefined): string {
  return kind ? (INTERACTION_KIND_LABELS[kind] ?? kind) : '';
}

/** Word for a whole-star score, used by the star input ("4 stars, Great"). */
export const SCORE_WORDS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Great',
  5: 'Excellent',
};

/** "4.5" (one decimal) or "—" without ratings. */
export function formatAverage(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toFixed(1);
}

/** "12 ratings", "1 rating", "No ratings yet". */
export function ratingCountLabel(count: number | null | undefined): string {
  if (!count) {
    return 'No ratings yet';
  }
  return `${count} ${count === 1 ? 'rating' : 'ratings'}`;
}

/** Interactions the caller can still rate (eligible and not rated yet), most recent first. */
export function rateableInteractions(
  eligibility: RatingEligibility | null | undefined,
): RatingEligibilityInteraction[] {
  return (eligibility?.interactions ?? [])
    .filter((interaction) => !interaction.alreadyRated)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** True when a reference can be written: at least one interaction with the collector. */
export function canWriteReference(eligibility: RatingEligibility | null | undefined): boolean {
  return (eligibility?.interactions?.length ?? 0) > 0;
}

/** True while the author may still edit the rating (before `editableUntil`). */
export function isRatingEditable(
  rating: Pick<RatingResponse, 'editableUntil'>,
  now: Date = new Date(),
): boolean {
  const until = Date.parse(rating.editableUntil);
  return Number.isFinite(until) && until > now.getTime();
}

/** The breakdown entries a rating actually carries, in display order. */
export function breakdownEntries(
  breakdown: RatingBreakdown | null | undefined,
): { label: string; value: number }[] {
  if (!breakdown) {
    return [];
  }
  return RATING_CRITERIA.flatMap((criterion) => {
    const value = breakdown[criterion.key];
    return typeof value === 'number' ? [{ label: criterion.label, value }] : [];
  });
}

/** Inline wording of the refusals of `POST /ratings`, `PUT /ratings/{id}` and `POST /references`. */
export function ratingProblem(
  error: ApiError,
  displayName: string,
  subject: 'rating' | 'reference' = 'rating',
): string {
  switch (error.errorCode) {
    case 'RATING_NOT_ELIGIBLE':
      return (
        `You can ${subject === 'rating' ? 'rate' : 'write a reference for'} ${displayName} ` +
        'after a completed trade, an accepted offer or a conversation where you both sent at ' +
        'least 3 messages.'
      );
    case 'ALREADY_RATED':
      return 'You already rated this interaction. Edit your rating from the list instead.';
    case 'RATING_EDIT_WINDOW_CLOSED':
      return `Ratings can only be changed during the first ${RATING_EDIT_DAYS} days.`;
    case 'CONFLICT':
      return `You already wrote a reference for ${displayName}.`;
    case 'VALIDATION_FAILED': {
      const field = error.fieldErrors['comment'] ?? error.fieldErrors['body'];
      if (field) {
        return /banned|guideline|not allowed/i.test(field)
          ? 'Your text breaks the community guidelines. Please rephrase it.'
          : `Check your text: ${field}.`;
      }
      return friendlyMessage(error);
    }
    default:
      return friendlyMessage(error);
  }
}
