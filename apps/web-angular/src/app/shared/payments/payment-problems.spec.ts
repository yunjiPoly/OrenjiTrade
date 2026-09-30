import { ApiError } from '../../core/http/api-error';
import { paymentProblem } from './payment-problems';

function apiError(status: number, errorCode: string, extra: Record<string, unknown> = {}) {
  return new ApiError(
    { errorCode, message: `${errorCode} message`, requestId: 'req-1', status, fieldErrors: {} },
    { problem: { errorCode, status, ...extra } },
  );
}

describe('payment problems', () => {
  it('explains a seller who has not set up payouts', () => {
    const problem = paymentProblem(apiError(409, 'SELLER_NOT_ONBOARDED'), 'Ada');
    expect(problem.message).toContain('Ada has not set up payouts yet');
    expect(problem.reload).toBe(false);
  });

  it('says when the dispute window closed and re-reads', () => {
    const problem = paymentProblem(
      apiError(409, 'DISPUTE_WINDOW_CLOSED', { disputeWindowEndsAt: '2026-10-06T15:44:16Z' }),
      'Ada',
    );
    expect(problem.message).toMatch(/^The dispute window closed on Oct 6, 2026/);
    expect(problem.reload).toBe(true);
    expect(paymentProblem(apiError(409, 'DISPUTE_WINDOW_CLOSED'), 'Ada').message).toMatch(
      /^The dispute window closed\. Message Ada/,
    );
  });

  it('words the evidence limit, files and the disabled feature', () => {
    expect(paymentProblem(apiError(409, 'EVIDENCE_LIMIT_REACHED', { limit: 10 })).message).toBe(
      'You already added 10 pieces of evidence, the most allowed per collector.',
    );
    expect(paymentProblem(apiError(413, 'PAYLOAD_TOO_LARGE')).message).toContain('8 MB');
    expect(paymentProblem(apiError(415, 'UNSUPPORTED_MEDIA_TYPE')).message).toContain('PDF');
    expect(paymentProblem(apiError(404, 'FEATURE_DISABLED')).message).toBe(
      'Payment protection is not available right now. Please try again later.',
    );
  });

  it('falls back to the trade wording for state changes', () => {
    const problem = paymentProblem(
      apiError(409, 'INVALID_STATE_TRANSITION', { currentStatus: 'CANCELLED' }),
      'Ada',
    );
    expect(problem.message).toBe('This can no longer be done: it was already cancelled.');
    expect(problem.reload).toBe(true);
  });
});
