import { ApiError, NETWORK_ERROR_CODE } from '@/src/api/ApiError';
import { REQUEST_ID_HEADER, createApiClient, resolveApiBaseUrl } from '@/src/api/client';
import { setIdTokenProvider } from '@/src/auth/tokenProvider';

function jsonResponse(body: unknown, status: number, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

describe('api client', () => {
  const fetchMock = jest.fn<Promise<Response>, [Request]>();
  const client = createApiClient({
    baseUrl: 'http://api.test/',
    fetch: fetchMock as unknown as typeof fetch,
  });

  afterEach(() => {
    setIdTokenProvider(null);
  });

  it('resolves the base URL from the environment with a sane default', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('http://localhost:8080');
    expect(resolveApiBaseUrl('   ')).toBe('http://localhost:8080');
    expect(resolveApiBaseUrl('https://api.orenjitrade.com/')).toBe('https://api.orenjitrade.com');
  });

  it('returns typed data on success and sends X-Request-Id without Authorization when anonymous', async () => {
    const meta = {
      name: 'OrenjiTrade API',
      version: '0.1.0',
      environment: 'test',
      serverTime: '2026-09-29T12:00:00Z',
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(meta, 200));

    const { data } = await client.GET('/api/v1/meta');

    expect(data).toEqual(meta);
    const request = fetchMock.mock.calls[0]?.[0];
    expect(request?.url).toBe('http://api.test/api/v1/meta');
    expect(request?.headers.get(REQUEST_ID_HEADER)).toBe('00000000-0000-4000-8000-000000000000');
    expect(request?.headers.get('Authorization')).toBeNull();
  });

  it('adds a bearer token when the session provides one', async () => {
    setIdTokenProvider(async () => 'id-token-123');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ name: 'x', version: '1', environment: 'e', serverTime: 't' }, 200)
    );

    await client.GET('/api/v1/meta');

    expect(fetchMock.mock.calls[0]?.[0]?.headers.get('Authorization')).toBe('Bearer id-token-123');
  });

  it('maps an RFC 9457 ProblemDetail body to ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          type: 'https://orenjitrade.com/problems/validation',
          title: 'Validation failed',
          status: 422,
          errorCode: 'VALIDATION_FAILED',
          message: 'Some fields are invalid.',
          requestId: 'req-42',
          timestamp: '2026-09-29T12:00:00Z',
          errors: [{ field: 'email', message: 'must be a valid address' }],
        },
        422,
        'application/problem+json'
      )
    );

    const error = await client.GET('/api/v1/meta').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(422);
    expect(apiError.errorCode).toBe('VALIDATION_FAILED');
    expect(apiError.message).toBe('Some fields are invalid.');
    expect(apiError.requestId).toBe('req-42');
    expect(apiError.fieldErrors).toEqual({ email: 'must be a valid address' });
    expect(apiError.isNetworkError).toBe(false);
  });

  it('falls back to the request id and a generic message when the error body is not a problem', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Bad Gateway', { status: 502, headers: { 'content-type': 'text/plain' } })
    );

    const error = (await client.GET('/api/v1/meta').catch((caught: unknown) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.errorCode).toBe('UNKNOWN_ERROR');
    expect(error.message).toBe('Bad Gateway');
    expect(error.requestId).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('wraps transport failures as a network ApiError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    const error = (await client.GET('/api/v1/meta').catch((caught: unknown) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.errorCode).toBe(NETWORK_ERROR_CODE);
    expect(error.isNetworkError).toBe(true);
    expect(error.cause).toBeInstanceOf(TypeError);
  });
});
