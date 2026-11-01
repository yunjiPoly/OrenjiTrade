import { formatLongDate, formatMonthDay } from '@/src/lib/dates';

/**
 * The words of "Rate a collector" and "Write a reference" (mockup v50 screens 61 and 62, stage
 * R14), in one place. The refusals are in `collectors/ratingLabels.ts` (`ratingProblem`).
 */
export const RATING_COPY = {
  title: (name: string) => `Rate ${name}`,
  editTitle: 'Edit your rating',
  back: 'Back',
  overall: 'Overall',
  overallLabel: 'Overall score',
  details: 'Details · optional',
  comment: 'Comment (optional)',
  commentCount: (count: number, max: number) => `${count} / ${max}`,
  commentPlaceholder: 'How did it go? Keep it factual and friendly.',
  commentTooLong: (max: number) => `Keep the comment under ${max} characters.`,
  appears: (handle: string, days: number) =>
    `Your rating appears on ${handle}’s profile with your name. You can change it for ${days} days.`,
  referenceInstead: 'Write a reference instead',
  publish: 'Publish rating',
  save: 'Save changes',
  saving: 'Saving…',
  chooseOverall: 'Choose an overall score first.',
  whichInteraction: 'Which deal are you rating?',
  published: (name: string) => `Thanks! Your rating of ${name} is published.`,
  updated: 'Your rating is updated.',
  saveFailed: 'Your rating could not be saved. Please try again.',
  checkFailed: 'We could not check what you can rate',
  cannotRate: (name: string) => `You cannot rate ${name} now`,
  alreadyRated: (name: string) => `You already rated this interaction with ${name}.`,
  loadFailed: 'Your rating could not load',
  missingTitle: 'Open your rating again',
  missingBody: (name: string) => `Edit your rating from ${name}'s profile.`,
  invalidTitle: 'Nothing to rate here',
  invalidBody: "Open the collector's profile and rate them from there.",
  /** A star's name for VoiceOver ("Communication: 4 stars, Good"). */
  star: (label: string, score: number, word: string) =>
    `${label}: ${score} ${score === 1 ? 'star' : 'stars'}, ${word}`,
  clearHint: 'Tap the chosen star again to clear it',
  // Write a reference (62).
  referenceTitle: 'Write a reference',
  referenceIntro: (name: string) =>
    `A reference is a short public recommendation on ${name}’s profile. You can write one per collector.`,
  reference: 'Reference',
  referencePlaceholder: 'What makes them a great collector to trade with?',
  referenceTooLong: (max: number) => `Keep it under ${max} characters.`,
  referenceEmpty: 'Write a few words first.',
  publishReference: 'Publish reference',
  publishing: 'Publishing…',
  referencePublished: (name: string) => `Your reference for ${name} is published.`,
  referenceFailed: 'Your reference could not be published. Please try again.',
  referenceInvalidTitle: 'Nothing to write here',
  referenceInvalidBody: "Open the collector's profile and write the reference from there.",
} as const;

/** The words of a whole-star score (mockup v50 screen 61): Poor, Not great, Okay, Good, Excellent. */
export const STAR_WORDS: Readonly<Record<number, string>> = {
  1: 'Poor',
  2: 'Not great',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
};

/** The interaction as the rating form names it. */
export interface DealLineInput {
  kind: string;
  occurredAt: string;
  dealName?: string | null;
  soldToYou?: boolean | null;
}

const KIND_WORDS: Readonly<Record<string, string>> = {
  TRADE: 'Completed trade',
  OFFER_ACCEPTED: 'Accepted offer',
  CONVERSATION_QUALIFIED: 'Conversation',
  SALE: 'Sale',
};

/**
 * The line under the collector (mockup v50 screen 61): "Ash Blossom & Joyous Spring · sold to you
 * Oct 17" for the buyer, "… · bought from you Oct 17" for the seller, "Conversation · Oct 12" for an
 * interaction that is not a sale (or a sale an older server does not name).
 */
export function dealLine(interaction: DealLineInput, now: Date = new Date()): string {
  const when = formatMonthDay(interaction.occurredAt, now);
  if (interaction.kind === 'SALE' && interaction.dealName) {
    if (interaction.soldToYou === true) {
      return `${interaction.dealName} · sold to you ${when}`;
    }
    if (interaction.soldToYou === false) {
      return `${interaction.dealName} · bought from you ${when}`;
    }
    return `${interaction.dealName} · ${when}`;
  }
  return `${KIND_WORDS[interaction.kind] ?? interaction.kind} · ${when}`;
}

/** The line of a rating being edited: "Sale · you can change it until October 31, 2026". */
export function editLine(kind: string, editableUntil: string): string {
  return `${KIND_WORDS[kind] ?? kind} · you can change it until ${formatLongDate(editableUntil)}`;
}
