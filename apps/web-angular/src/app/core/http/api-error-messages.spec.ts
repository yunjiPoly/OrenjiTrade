import { ApiError } from './api-error';
import { friendlyError, friendlyMessage } from './api-error-messages';
import { isPublicApiUrl } from './http-context';

function error(errorCode: string, status: number, message = 'server says'): ApiError {
  return new ApiError(
    { errorCode, status, message, requestId: 'r-1', fieldErrors: {} },
    { problem: errorCode === 'RATE_LIMITED' ? { retryAfterSeconds: 42 } : undefined },
  );
}

describe('friendlyError', () => {
  it('explains network failures and rate limits', () => {
    expect(friendlyError(error('NETWORK_ERROR', 0)).title).toBe('You seem to be offline');
    expect(friendlyMessage(error('RATE_LIMITED', 429))).toContain('42 seconds');
  });

  it('uses safe server messages for conflicts and hides infrastructure failures', () => {
    expect(friendlyMessage(error('CONFLICT', 409, 'A deletion request is already pending'))).toBe(
      'A deletion request is already pending',
    );
    expect(friendlyMessage(error('INTERNAL_ERROR', 500, 'NullPointerException'))).toBe(
      'Please try again in a moment.',
    );
    expect(friendlyMessage(error('HANDLE_TAKEN', 409))).toBe('That handle is already taken.');
    expect(friendlyMessage(error('PAYLOAD_TOO_LARGE', 413))).toContain('5 MB');
  });

  it('explains the 18+ gate without echoing anything else', () => {
    const problem = friendlyError(error('AGE_CONFIRMATION_REQUIRED', 403, 'server text'));
    expect(problem.title).toBe('Age confirmation needed');
    expect(problem.message).toContain('18 years of age or older');
    expect(problem.message).not.toContain('server text');
  });

  it('explains messaging and community refusals without echoing moderation details', () => {
    expect(friendlyError(error('MESSAGING_BLOCKED', 403)).title).toBe('Messaging unavailable');
    expect(friendlyMessage(error('MESSAGE_BLOCKED', 422, 'banned term xyz'))).not.toContain('xyz');
    expect(friendlyMessage(error('POST_BLOCKED', 422))).toContain('not published');
    expect(friendlyMessage(error('DUPLICATE_POST', 409))).toContain('last 24 hours');
  });
});

describe('isPublicApiUrl', () => {
  it('matches public routes and meta only', () => {
    expect(isPublicApiUrl('http://api.test/api/v1/public/legal/documents')).toBe(true);
    expect(isPublicApiUrl('/api/v1/meta')).toBe(true);
    expect(isPublicApiUrl('/api/v1/meta?x=1')).toBe(true);
    expect(isPublicApiUrl('/api/v1/metadata')).toBe(false);
    expect(isPublicApiUrl('/api/v1/me')).toBe(false);
    expect(isPublicApiUrl('http://api.test/api/v1/collectors/maika')).toBe(false);
  });
});
