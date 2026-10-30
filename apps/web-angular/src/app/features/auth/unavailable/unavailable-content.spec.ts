import { ApiError } from '../../../core/http/api-error';
import { UNAVAILABLE_COPY, unavailableContent } from './unavailable-content';

function apiError(status: number, errorCode = 'INTERNAL_ERROR'): ApiError {
  return new ApiError({
    errorCode,
    message: 'Something went wrong',
    requestId: 'req-7',
    status,
    fieldErrors: {},
  });
}

describe('"We could not load your account" (spec 14, an account state)', () => {
  it('says to check the connection when OrenjiTrade could not be reached', () => {
    expect(unavailableContent(null)).toEqual({
      expired: false,
      title: UNAVAILABLE_COPY.title,
      text: UNAVAILABLE_COPY.text,
      reference: null,
    });
    expect(unavailableContent(apiError(0, 'NETWORK_ERROR')).title).toBe(
      'We could not load your account',
    );
  });

  it('names a timeout, an ended session, and gives the reference of an answer', () => {
    expect(unavailableContent(apiError(504)).title).toBe('No answer from OrenjiTrade');
    const expired = unavailableContent(apiError(401, 'UNAUTHORIZED'));
    expect(expired.expired).toBe(true);
    expect(expired.title).toBe('Please sign in again');
    const server = unavailableContent(apiError(503));
    expect(server.expired).toBe(false);
    expect(server.reference).toBe('INTERNAL_ERROR · req-7');
  });
});
