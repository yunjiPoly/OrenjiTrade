import { ApiError } from '@/src/api/ApiError';
import { unavailableContent } from '@/src/features/account/unavailableContent';

const problem = (status: number, errorCode: string, message: string) =>
  ApiError.fromProblem(status, { status, errorCode, message, requestId: 'req-42' });

describe('46 Could not load: the words follow the error (stage R12, review fix 1)', () => {
  it("says the mockup's words when the phone could not reach OrenjiTrade", () => {
    expect(unavailableContent(ApiError.network(new TypeError('Network request failed')))).toEqual({
      expired: false,
      title: 'We could not load your account',
      text: 'Check your connection, then try again. Nothing on your account changed.',
      reference: null,
    });
    expect(unavailableContent(new Error('boom')).text).toBe(
      'Check your connection, then try again. Nothing on your account changed.'
    );
  });

  it('says "No answer from OrenjiTrade" when the request timed out', () => {
    expect(unavailableContent(ApiError.timeout(15_000, 'req-7'))).toEqual({
      expired: false,
      title: 'No answer from OrenjiTrade',
      text: 'This is taking too long. Check your connection and try again.',
      reference: null,
    });
  });

  it('gives an answer of the API in its own sentence, with the error code and the request id', () => {
    expect(unavailableContent(problem(500, 'INTERNAL_ERROR', 'SQL details never shown'))).toEqual({
      expired: false,
      title: 'We could not load your account',
      text: 'Please try again in a moment.',
      reference: 'INTERNAL_ERROR · req-42',
    });
    const limited = unavailableContent(problem(429, 'RATE_LIMITED', 'Too many requests'));
    expect(limited.text).not.toMatch(/connection/);
    expect(limited.reference).toBe('RATE_LIMITED · req-42');
  });

  it('asks to sign in again when the session ended', () => {
    expect(unavailableContent(problem(401, 'UNAUTHENTICATED', 'Token expired'))).toEqual({
      expired: true,
      title: 'Please sign in again',
      text: 'Your session ended. Sign in again to keep using OrenjiTrade.',
      reference: 'UNAUTHENTICATED · req-42',
    });
  });
});
