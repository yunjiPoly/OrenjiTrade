import { ApiError } from '../../core/http/api-error';
import {
  breakdownEntries,
  canWriteReference,
  formatAverage,
  isRatingEditable,
  rateableInteractions,
  ratingCountLabel,
  ratingProblem,
} from './rating-labels';

function apiError(status: number, errorCode: string, fieldErrors: Record<string, string> = {}) {
  return new ApiError({ status, errorCode, message: 'server text', requestId: null, fieldErrors });
}

describe('rating labels', () => {
  const eligibility = {
    eligible: true,
    interactions: [
      { id: 'a', kind: 'TRADE', occurredAt: '2026-09-20T10:00:00Z', alreadyRated: true },
      {
        id: 'b',
        kind: 'CONVERSATION_QUALIFIED',
        occurredAt: '2026-09-21T10:00:00Z',
        alreadyRated: false,
      },
      { id: 'c', kind: 'OFFER_ACCEPTED', occurredAt: '2026-09-25T10:00:00Z', alreadyRated: false },
    ],
  } as never;

  it('keeps only unrated interactions, most recent first', () => {
    expect(rateableInteractions(eligibility).map((interaction) => interaction.id)).toEqual([
      'c',
      'b',
    ]);
    expect(rateableInteractions(null)).toEqual([]);
  });

  it('allows a reference after any interaction', () => {
    expect(canWriteReference(eligibility)).toBe(true);
    expect(canWriteReference({ eligible: false, interactions: [] })).toBe(false);
    expect(canWriteReference(undefined)).toBe(false);
  });

  it('knows when a rating can still be edited', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    expect(isRatingEditable({ editableUntil: '2026-10-10T00:00:00Z' }, now)).toBe(true);
    expect(isRatingEditable({ editableUntil: '2026-09-30T00:00:00Z' }, now)).toBe(false);
    expect(isRatingEditable({ editableUntil: 'not a date' }, now)).toBe(false);
  });

  it('lists the scored criteria in display order', () => {
    expect(breakdownEntries({ shipping: 4, communication: 5, conditionAccuracy: null })).toEqual([
      { label: 'Communication', value: 5 },
      { label: 'Shipping', value: 4 },
    ]);
    expect(breakdownEntries(null)).toEqual([]);
  });

  it('formats averages and counts', () => {
    expect(formatAverage(4.5)).toBe('4.5');
    expect(formatAverage(5)).toBe('5.0');
    expect(formatAverage(null)).toBe('—');
    expect(ratingCountLabel(0)).toBe('No ratings yet');
    expect(ratingCountLabel(1)).toBe('1 rating');
    expect(ratingCountLabel(12)).toBe('12 ratings');
  });

  it('explains every refusal inline', () => {
    expect(ratingProblem(apiError(403, 'RATING_NOT_ELIGIBLE'), 'Tess')).toContain(
      'You can rate Tess after a completed trade',
    );
    expect(ratingProblem(apiError(403, 'RATING_NOT_ELIGIBLE'), 'Tess', 'reference')).toContain(
      'You can write a reference for Tess',
    );
    expect(ratingProblem(apiError(409, 'ALREADY_RATED'), 'Tess')).toContain('already rated');
    expect(ratingProblem(apiError(409, 'RATING_EDIT_WINDOW_CLOSED'), 'Tess')).toContain('14 days');
    expect(ratingProblem(apiError(409, 'CONFLICT'), 'Tess')).toContain('already wrote a reference');
    expect(
      ratingProblem(
        apiError(400, 'VALIDATION_FAILED', { comment: 'contains a term that is not allowed' }),
        'Tess',
      ),
    ).toContain('breaks the community guidelines');
  });
});
