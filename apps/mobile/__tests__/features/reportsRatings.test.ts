import { ApiError } from '@/src/api/ApiError';
import {
  breakdownEntries,
  canWriteReference,
  isRatingEditable,
  rateableInteractions,
  ratingHint,
  ratingProblem,
} from '@/src/features/collectors/ratingLabels';
import { parseRatingParams, ratingParams } from '@/src/features/ratings/ratingRoutes';
import {
  isOpenReport,
  myReportStatusText,
  parseReportParams,
  reportParams,
  reportProblem,
  reportReasonLabel,
  reportStatusLabel,
} from '@/src/features/reports/reportLabels';

import { OTHER_ID, eligibilityFixture, myReportFixture } from '../support/fixtures';

function apiError(
  status: number,
  errorCode: string,
  fieldErrors: Record<string, string> = {}
): ApiError {
  return new ApiError({ status, errorCode, message: 'Refused', fieldErrors });
}

describe('collector reports', () => {
  it('words reasons and statuses, never the decision itself', () => {
    expect(reportReasonLabel('INAPPROPRIATE_BEHAVIOR')).toBe('Inappropriate behaviour');
    expect(reportReasonLabel('NEW')).toBe('NEW');
    expect(reportStatusLabel('ACTIONED')).toBe('Action taken');
    expect(isOpenReport('UNDER_REVIEW')).toBe(true);
    expect(isOpenReport('DISMISSED')).toBe(false);
    expect(myReportStatusText(myReportFixture())).toBe('Waiting for a moderator');
    expect(myReportStatusText(myReportFixture({ status: 'ACTIONED' }))).toBe(
      'Reviewed — the team took action'
    );
    expect(myReportStatusText(myReportFixture({ status: 'DISMISSED' }))).toBe(
      'Reviewed — no violation found'
    );
  });

  it('explains the refusals of POST /reports/collectors', () => {
    const open = reportProblem(apiError(409, 'REPORT_ALREADY_OPEN'), 'Noé');
    expect(open.alreadyOpen).toBe(true);
    expect(open.message).toMatch(/You already reported Noé.*Settings → My reports/);
    expect(reportProblem(apiError(422, 'CANNOT_REPORT_SELF'), 'Noé').message).toBe(
      'You cannot report yourself.'
    );
    expect(reportProblem(apiError(404, 'NOT_FOUND'), 'Noé').message).toBe(
      'Noé is no longer available on OrenjiTrade.'
    );
    expect(reportProblem(apiError(429, 'RATE_LIMITED'), 'Noé').message).toMatch(
      /several reports today/
    );
    expect(
      reportProblem(apiError(400, 'VALIDATION_FAILED', { details: 'too long' }), 'Noé').message
    ).toMatch(/1,000 characters/);
    expect(reportProblem(apiError(400, 'VALIDATION_FAILED'), 'Noé').message).toMatch(
      /Report the collector from their profile/
    );
  });

  it('passes the collector and the context through the route', () => {
    const params = reportParams(
      { id: OTHER_ID, displayName: 'Noé Verdun', handle: 'collector2' },
      { source: 'CONVERSATION', conversationId: 'conv-1' }
    );
    expect(params).toEqual({
      userId: OTHER_ID,
      name: 'Noé Verdun',
      handle: 'collector2',
      source: 'CONVERSATION',
      conversationId: 'conv-1',
    });
    expect(parseReportParams(params)).toEqual({
      target: { id: OTHER_ID, displayName: 'Noé Verdun', handle: 'collector2' },
      context: { source: 'CONVERSATION', conversationId: 'conv-1' },
    });
    // Unknown sources fall back to the profile; ids of another source are ignored.
    expect(parseReportParams({ userId: OTHER_ID, source: 'NOPE', postId: 'p1' })).toEqual({
      target: { id: OTHER_ID, displayName: 'this collector', handle: null },
      context: { source: 'PROFILE' },
    });
    expect(parseReportParams({ userId: 'bad id!' })).toBeNull();
    expect(parseReportParams({})).toBeNull();
  });
});

describe('ratings and references', () => {
  it('offers the interactions not rated yet and says why not', () => {
    const eligibility = eligibilityFixture({
      interactions: [
        {
          id: 'a',
          kind: 'CONVERSATION_QUALIFIED',
          occurredAt: '2026-10-01T00:00:00Z',
          alreadyRated: false,
        },
        { id: 'b', kind: 'TRADE', occurredAt: '2026-10-03T00:00:00Z', alreadyRated: false },
        { id: 'c', kind: 'OFFER_ACCEPTED', occurredAt: '2026-10-02T00:00:00Z', alreadyRated: true },
      ],
    });
    expect(rateableInteractions(eligibility).map((interaction) => interaction.id)).toEqual([
      'b',
      'a',
    ]);
    expect(canWriteReference(eligibility)).toBe(true);
    expect(ratingHint(eligibility, 'Noé')).toBeNull();
    const rated = eligibilityFixture({
      eligible: false,
      interactions: [
        { id: 'c', kind: 'TRADE', occurredAt: '2026-10-02T00:00:00Z', alreadyRated: true },
      ],
    });
    expect(ratingHint(rated, 'Noé')).toMatch(/already rated your interactions with Noé/);
    const none = eligibilityFixture({ eligible: false, interactions: [] });
    expect(ratingHint(none, 'Noé')).toMatch(/You can rate Noé after a completed trade/);
    expect(canWriteReference(none)).toBe(false);
    expect(ratingHint(undefined, 'Noé')).toBeNull();
  });

  it('edits within the window and lists the scored criteria', () => {
    const now = Date.parse('2026-10-05T00:00:00Z');
    expect(isRatingEditable({ editableUntil: '2026-10-10T00:00:00Z' }, now)).toBe(true);
    expect(isRatingEditable({ editableUntil: '2026-10-01T00:00:00Z' }, now)).toBe(false);
    expect(breakdownEntries({ communication: 5, shipping: null, meetupReliability: 4 })).toEqual([
      { label: 'Communication', value: 5 },
      { label: 'Meetup reliability', value: 4 },
    ]);
  });

  it('explains refusals of ratings and references, banned terms included', () => {
    expect(ratingProblem(apiError(403, 'RATING_NOT_ELIGIBLE'), 'Noé')).toMatch(
      /You can rate Noé after a completed trade/
    );
    expect(ratingProblem(apiError(403, 'RATING_NOT_ELIGIBLE'), 'Noé', 'reference')).toMatch(
      /write a reference for Noé/
    );
    expect(ratingProblem(apiError(409, 'ALREADY_RATED'), 'Noé')).toMatch(/already rated/);
    expect(ratingProblem(apiError(409, 'RATING_EDIT_WINDOW_CLOSED'), 'Noé')).toMatch(/14 days/);
    expect(ratingProblem(apiError(409, 'CONFLICT'), 'Noé', 'reference')).toBe(
      'You already wrote a reference for Noé.'
    );
    expect(
      ratingProblem(
        apiError(400, 'VALIDATION_FAILED', { body: 'contains a term that is not allowed' }),
        'Noé',
        'reference'
      )
    ).toBe('Your text breaks the community guidelines. Please rephrase it.');
    expect(
      ratingProblem(apiError(400, 'VALIDATION_FAILED', { comment: 'is too long' }), 'Noé')
    ).toBe('Check your text: is too long.');
  });

  it('passes the collector, the kind and the rating through the route', () => {
    const params = ratingParams(
      { id: OTHER_ID, handle: 'collector2', displayName: 'Noé Verdun' },
      { kind: 'TRADE' }
    );
    expect(parseRatingParams(params)).toEqual({
      collector: { id: OTHER_ID, handle: 'collector2', displayName: 'Noé Verdun' },
      kind: 'TRADE',
      ratingId: null,
    });
    expect(
      parseRatingParams({ userId: OTHER_ID, handle: 'collector2', kind: 'X', rating: 'r1' })
    ).toEqual({
      collector: { id: OTHER_ID, handle: 'collector2', displayName: '@collector2' },
      kind: null,
      ratingId: 'r1',
    });
    expect(parseRatingParams({ userId: OTHER_ID })).toBeNull();
  });
});
