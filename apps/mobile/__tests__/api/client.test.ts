import { ApiError, NETWORK_ERROR_CODE } from '@/src/api/ApiError';
import { clearAccountSignal, useAccountSignalStore } from '@/src/api/accountSignal';
import {
  REQUEST_ID_HEADER,
  absoluteApiUrl,
  createApiClient,
  isPublicApiUrl,
  required,
} from '@/src/api/client';

function jsonResponse(body: unknown, status: number, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

const META = {
  name: 'OrenjiTrade API',
  version: '0.1.0',
  environment: 'test',
  serverTime: '2026-10-04T12:00:00Z',
};

describe('api client', () => {
  const fetchMock = jest.fn<Promise<Response>, [Request]>();
  const tokens = jest.fn<Promise<string | null>, [boolean]>();
  const client = createApiClient({
    baseUrl: 'http://api.test/',
    fetch: fetchMock as unknown as typeof fetch,
    tokenSource: tokens,
  });

  beforeEach(() => {
    fetchMock.mockReset();
    tokens.mockReset();
    tokens.mockImplementation(async (force) => (force ? 'fresh-token' : 'cached-token'));
    clearAccountSignal();
  });

  it('sends X-Request-Id and no Authorization on public routes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(META, 200));

    const { data } = await client.GET('/api/v1/meta');

    expect(data).toEqual(META);
    const request = fetchMock.mock.calls[0]?.[0];
    expect(request?.url).toBe('http://api.test/api/v1/meta');
    expect(request?.headers.get(REQUEST_ID_HEADER)).toBe('00000000-0000-4000-8000-000000000000');
    expect(request?.headers.get('Authorization')).toBeNull();
    expect(tokens).not.toHaveBeenCalled();
  });

  it('adds the Firebase ID token to every other route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ discoverable: false }, 200));

    await client.GET('/api/v1/me/location');

    expect(fetchMock.mock.calls[0]?.[0]?.headers.get('Authorization')).toBe('Bearer cached-token');
    expect(tokens).toHaveBeenCalledWith(false);
  });

  it('sends nothing when signed out', async () => {
    tokens.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 401, errorCode: 'UNAUTHENTICATED', message: 'Sign in' }, 401)
    );

    const error = (await client.GET('/api/v1/me').catch((caught: unknown) => caught)) as ApiError;

    expect(fetchMock.mock.calls[0]?.[0]?.headers.get('Authorization')).toBeNull();
    expect(error.isUnauthorized).toBe(true);
  });

  it('retries a 401 once with a force-refreshed token', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ status: 401, errorCode: 'UNAUTHENTICATED', message: 'expired' }, 401)
      )
      .mockResolvedValueOnce(jsonResponse({ discoverable: true }, 200));

    const { data } = await client.GET('/api/v1/me/location');

    expect(data).toEqual({ discoverable: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]?.headers.get('Authorization')).toBe('Bearer fresh-token');
    expect(tokens).toHaveBeenLastCalledWith(true);
  });

  it('does not retry 401 REAUTHENTICATION_REQUIRED', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { status: 401, errorCode: 'REAUTHENTICATION_REQUIRED', message: 'Sign in again' },
        401,
        'application/problem+json'
      )
    );

    const error = (await client
      .POST('/api/v1/me/deletion-requests', { body: { exportFirst: false } })
      .catch((caught: unknown) => caught)) as ApiError;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error.isReauthenticationRequired).toBe(true);
  });

  it('maps an RFC 9457 ProblemDetail body to ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          status: 400,
          errorCode: 'VALIDATION_FAILED',
          message: 'Some fields are invalid.',
          requestId: 'req-42',
          timestamp: '2026-10-04T12:00:00Z',
          errors: [{ field: 'handle', message: 'must match [a-z0-9_]{3,24}' }],
        },
        400,
        'application/problem+json'
      )
    );

    const error = (await client
      .PUT('/api/v1/me/profile', {
        body: { handle: 'x', displayName: 'X', bio: null, games: [], languages: [] },
      })
      .catch((caught: unknown) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.errorCode).toBe('VALIDATION_FAILED');
    expect(error.requestId).toBe('req-42');
    expect(error.fieldErrors).toEqual({ handle: 'must match [a-z0-9_]{3,24}' });
  });

  it('records 428 TERMS_ACCEPTANCE_REQUIRED and 403 deletion pending as account signals', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          status: 428,
          errorCode: 'TERMS_ACCEPTANCE_REQUIRED',
          message: 'Accept the terms',
          requiredConsents: [{ documentType: 'TERMS', version: '2026-10-01' }],
        },
        428
      )
    );
    await client.GET('/api/v1/me/profile').catch(() => undefined);
    expect(useAccountSignalStore.getState().signal).toMatchObject({
      kind: 'consent-required',
      requiredConsents: [{ documentType: 'TERMS', version: '2026-10-01' }],
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { status: 403, errorCode: 'ACCOUNT_SUSPENDED', message: 'deletion pending' },
        403
      )
    );
    await client.GET('/api/v1/me/profile').catch(() => undefined);
    expect(useAccountSignalStore.getState().signal).toMatchObject({ kind: 'deletion-pending' });
  });

  it('never records a signal for GET /me itself (the account provider reads it)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 403, errorCode: 'ACCOUNT_SUSPENDED', message: 'Suspended' }, 403)
    );
    await client.GET('/api/v1/me').catch(() => undefined);
    expect(useAccountSignalStore.getState().signal).toBeNull();
  });

  it('falls back to the request id and the text when the error body is not a problem', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Bad Gateway', { status: 502, headers: { 'content-type': 'text/plain' } })
    );

    const error = (await client.GET('/api/v1/meta').catch((caught: unknown) => caught)) as ApiError;

    expect(error.status).toBe(502);
    expect(error.errorCode).toBe('UNKNOWN_ERROR');
    expect(error.message).toBe('Bad Gateway');
    expect(error.requestId).toBe('00000000-0000-4000-8000-000000000000');
    expect(error.isServerError).toBe(true);
  });

  it('wraps transport failures as a network ApiError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    const error = (await client.GET('/api/v1/meta').catch((caught: unknown) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.errorCode).toBe(NETWORK_ERROR_CODE);
    expect(error.isNetworkError).toBe(true);
    expect(error.cause).toBeInstanceOf(TypeError);
  });
});

describe('client helpers', () => {
  it('recognises public routes', () => {
    expect(isPublicApiUrl('http://api.test/api/v1/public/legal/documents')).toBe(true);
    expect(isPublicApiUrl('/api/v1/meta')).toBe(true);
    expect(isPublicApiUrl('http://api.test/api/v1/me')).toBe(false);
  });

  it('resolves API-relative paths against the API origin', () => {
    expect(absoluteApiUrl('/api/v1/public/card-images/1')).toBe(
      'http://localhost:8080/api/v1/public/card-images/1'
    );
    expect(absoluteApiUrl('https://cdn.example.test/x.png')).toBe('https://cdn.example.test/x.png');
  });

  it('rejects an empty 2xx body', () => {
    expect(required({ a: 1 })).toEqual({ a: 1 });
    expect(() => required(undefined)).toThrow('The server sent an empty answer.');
  });
});
