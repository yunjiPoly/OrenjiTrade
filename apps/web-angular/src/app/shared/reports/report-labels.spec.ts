import { ApiError } from '../../core/http/api-error';
import { reportProblem } from './report-errors';
import {
  REPORT_REASONS,
  contextSourceLabel,
  isOpenReport,
  myReportStatusText,
  reportReasonLabel,
  reportStatusLabel,
  resolutionActionLabel,
} from './report-labels';

function apiError(status: number, errorCode: string, fieldErrors: Record<string, string> = {}) {
  return new ApiError({ status, errorCode, message: 'server text', requestId: 'r1', fieldErrors });
}

describe('report labels', () => {
  it('lists the reasons in the spec order with readable labels', () => {
    expect(REPORT_REASONS).toEqual([
      'SCAM',
      'COUNTERFEIT',
      'HARASSMENT',
      'SPAM',
      'INAPPROPRIATE_BEHAVIOR',
      'MISLEADING_LISTINGS',
      'OTHER',
    ]);
    expect(reportReasonLabel('MISLEADING_LISTINGS')).toBe('Misleading listings');
    expect(reportReasonLabel('NEW_REASON')).toBe('NEW_REASON');
    expect(reportReasonLabel(null)).toBe('');
  });

  it('words statuses, contexts and actions', () => {
    expect(reportStatusLabel('UNDER_REVIEW')).toBe('Under review');
    expect(contextSourceLabel('POST')).toBe('Community post');
    expect(resolutionActionLabel('LISTINGS_PAUSED')).toBe('Listings paused');
    expect(isOpenReport('OPEN')).toBe(true);
    expect(isOpenReport('UNDER_REVIEW')).toBe(true);
    expect(isOpenReport('DISMISSED')).toBe(false);
  });

  it('tells reporters where their report stands without specifics', () => {
    expect(myReportStatusText({ status: 'OPEN' } as never)).toBe('Waiting for a moderator');
    expect(myReportStatusText({ status: 'ACTIONED' } as never)).toBe(
      'Reviewed — the team took action',
    );
    expect(myReportStatusText({ status: 'DISMISSED' } as never)).toBe(
      'Reviewed — no violation found',
    );
  });
});

describe('reportProblem', () => {
  it('explains an already open report and keeps the dialog blocked', () => {
    const problem = reportProblem(apiError(409, 'REPORT_ALREADY_OPEN'), 'Tess');
    expect(problem.alreadyOpen).toBe(true);
    expect(problem.message).toContain('You already reported Tess');
    expect(problem.message).toContain('Settings → My reports');
  });

  it('covers self reports, missing collectors, the daily limit and bad details', () => {
    expect(reportProblem(apiError(422, 'CANNOT_REPORT_SELF'), 'Me').message).toBe(
      'You cannot report yourself.',
    );
    expect(reportProblem(apiError(404, 'NOT_FOUND'), 'Gone').message).toContain(
      'Gone is no longer available',
    );
    expect(reportProblem(apiError(429, 'RATE_LIMITED'), 'Tess').message).toContain(
      'several reports today',
    );
    expect(
      reportProblem(apiError(400, 'VALIDATION_FAILED', { details: 'too long' }), 'Tess').message,
    ).toContain('1,000 characters');
    const other = reportProblem(apiError(500, 'INTERNAL_ERROR'), 'Tess');
    expect(other.alreadyOpen).toBe(false);
    expect(other.message).toBe('Please try again in a moment.');
  });
});
