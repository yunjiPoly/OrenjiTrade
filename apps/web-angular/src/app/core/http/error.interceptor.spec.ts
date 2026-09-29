import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';
import { apiBaseUrlInterceptor } from './api-base-url.interceptor';
import { ApiError, isApiError } from './api-error';
import { errorInterceptor } from './error.interceptor';
import { REQUEST_ID_HEADER, SKIP_ERROR_TOAST } from './http-context';
import { requestIdInterceptor } from './request-id.interceptor';

const API = 'http://api.test';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let snackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    snackBar = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([apiBaseUrlInterceptor, requestIdInterceptor, errorInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    TestBed.inject(AppConfigService).set({ apiBaseUrl: API });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function failWith(
    status: number,
    body: object | string | null,
    options: { context?: HttpContext; statusText?: string } = {},
  ): Promise<ApiError> {
    const promise = firstValueFrom(http.get('/api/v1/meta', { context: options.context }));
    const req = backend.expectOne(`${API}/api/v1/meta`);
    if (status === 0) {
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    } else {
      req.flush(body, { status, statusText: options.statusText ?? 'Error' });
    }
    const error: unknown = await promise.catch((e: unknown) => e);
    if (!isApiError(error)) {
      throw new Error(`expected ApiError, got ${String(error)}`);
    }
    return error;
  }

  it('maps a ProblemDetail response to ApiError with all fields', async () => {
    const error = await failWith(400, {
      type: 'https://orenjitrade.com/problems/validation',
      title: 'Bad Request',
      status: 400,
      detail: 'Validation failed',
      errorCode: 'VALIDATION_FAILED',
      message: 'Please fix the highlighted fields.',
      requestId: 'req-123',
      timestamp: '2026-09-29T00:00:00Z',
      errors: [
        { field: 'displayName', message: 'must not be blank' },
        { field: 'radiusKm', message: 'must be at most 50' },
      ],
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.errorCode).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Please fix the highlighted fields.');
    expect(error.requestId).toBe('req-123');
    expect(error.status).toBe(400);
    expect(error.fieldErrors).toEqual({
      displayName: 'must not be blank',
      radiusKm: 'must be at most 50',
    });
    expect(error.toJSON()).toEqual({
      errorCode: 'VALIDATION_FAILED',
      message: 'Please fix the highlighted fields.',
      requestId: 'req-123',
      status: 400,
      fieldErrors: { displayName: 'must not be blank', radiusKm: 'must be at most 50' },
    });
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('shows a retry toast for 5xx responses and falls back to the outgoing request id', async () => {
    const error = await failWith(503, { title: 'Service Unavailable', status: 503 });

    expect(error.status).toBe(503);
    expect(error.isServerError).toBe(true);
    expect(error.errorCode).toBe('UNKNOWN_ERROR');
    expect(error.message).toBe('Service Unavailable');
    expect(error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(snackBar.open).toHaveBeenCalledTimes(1);
    const [message, action] = snackBar.open.mock.calls[0] as [string, string];
    expect(message).toMatch(/retry/i);
    expect(action).toMatch(/retry/i);
  });

  it('shows a toast and NETWORK_ERROR for failures that never reached the server', async () => {
    const error = await failWith(0, null);

    expect(error.status).toBe(0);
    expect(error.isNetworkError).toBe(true);
    expect(error.errorCode).toBe('NETWORK_ERROR');
    expect(snackBar.open).toHaveBeenCalledTimes(1);
    expect(String(snackBar.open.mock.calls[0]?.[0])).toMatch(/retry/i);
  });

  it('respects the SKIP_ERROR_TOAST context token', async () => {
    const context = new HttpContext().set(SKIP_ERROR_TOAST, true);
    const error = await failWith(500, { errorCode: 'INTERNAL_ERROR' }, { context });
    expect(error.errorCode).toBe('INTERNAL_ERROR');
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('adds X-Request-Id and the API base URL to API requests only', () => {
    http.get('/api/v1/meta').subscribe();
    http.get('config.json').subscribe();

    const apiReq = backend.expectOne(`${API}/api/v1/meta`);
    expect(apiReq.request.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
    apiReq.flush({});

    const configReq = backend.expectOne('config.json');
    expect(configReq.request.headers.has(REQUEST_ID_HEADER)).toBe(false);
    configReq.flush({});
  });
});
