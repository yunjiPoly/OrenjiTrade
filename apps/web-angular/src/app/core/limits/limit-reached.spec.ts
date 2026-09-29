import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';
import { apiBaseUrlInterceptor } from '../http/api-base-url.interceptor';
import { ApiError, isApiError } from '../http/api-error';
import { errorInterceptor } from '../http/error.interceptor';
import { SKIP_LIMIT_DIALOG } from '../http/http-context';
import { DEFAULT_UPGRADE_URL, limitReachedInfo, safeUpgradeUrl } from './limit-reached';
import { limitReachedInterceptor } from './limit-reached.interceptor';
import { LimitReachedService } from './limit-reached.service';

const API = 'http://api.test';

function limitError(problem: Record<string, unknown>): ApiError {
  return new ApiError(
    {
      errorCode: 'LIMIT_REACHED',
      message: 'Limit reached',
      requestId: 'req-1',
      status: 429,
      fieldErrors: {},
    },
    { problem },
  );
}

describe('limitReachedInfo', () => {
  it('reads the LIMIT_REACHED extensions', () => {
    const info = limitReachedInfo(
      limitError({
        limitKey: 'binder.views.per_day',
        limit: 30,
        used: 30,
        resetsAt: '2026-09-30T00:00:00Z',
        planCode: 'FREE',
        upgradeUrl: '/premium',
      }),
    );
    expect(info).toEqual({
      limitKey: 'binder.views.per_day',
      limit: 30,
      used: 30,
      resetsAt: '2026-09-30T00:00:00Z',
      planCode: 'FREE',
      upgradeUrl: '/premium',
      requestId: 'req-1',
    });
  });

  it('tolerates missing extensions', () => {
    const info = limitReachedInfo(limitError({}));
    expect(info.limitKey).toBe('');
    expect(info.limit).toBeNull();
    expect(info.used).toBeNull();
    expect(info.resetsAt).toBeNull();
    expect(info.upgradeUrl).toBe(DEFAULT_UPGRADE_URL);
  });

  it('only follows same-app upgrade paths', () => {
    expect(safeUpgradeUrl('/premium?from=limit')).toBe('/premium?from=limit');
    expect(safeUpgradeUrl('https://evil.example/premium')).toBe('/premium');
    expect(safeUpgradeUrl('//evil.example')).toBe('/premium');
    expect(safeUpgradeUrl('javascript:alert(1)')).toBe('/premium');
    expect(safeUpgradeUrl(undefined)).toBe('/premium');
  });
});

describe('limitReachedInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let show: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    show = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([apiBaseUrlInterceptor, limitReachedInterceptor, errorInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: LimitReachedService, useValue: { show } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    TestBed.inject(AppConfigService).set({ apiBaseUrl: API });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('opens the dialog for LIMIT_REACHED and still rejects the caller', async () => {
    const result = firstValueFrom(http.get('/api/v1/binders/b-1')).catch((e: unknown) => e);
    backend
      .expectOne(`${API}/api/v1/binders/b-1`)
      .flush(
        { errorCode: 'LIMIT_REACHED', status: 429, limitKey: 'binder.views.per_day', limit: 30 },
        { status: 429, statusText: 'Too Many Requests' },
      );
    const error = await result;
    expect(isApiError(error) && error.errorCode).toBe('LIMIT_REACHED');
    expect(show).toHaveBeenCalledTimes(1);
    expect((show.mock.calls[0][0] as ApiError).problem?.limitKey).toBe('binder.views.per_day');
  });

  it('ignores other errors, including RATE_LIMITED', async () => {
    const result = firstValueFrom(http.get('/api/v1/cards')).catch((e: unknown) => e);
    backend
      .expectOne(`${API}/api/v1/cards`)
      .flush({ errorCode: 'RATE_LIMITED', status: 429 }, { status: 429, statusText: 'Too Many' });
    await result;
    expect(show).not.toHaveBeenCalled();
  });

  it('respects SKIP_LIMIT_DIALOG', async () => {
    const result = firstValueFrom(
      http.get('/api/v1/wishlist', { context: new HttpContext().set(SKIP_LIMIT_DIALOG, true) }),
    ).catch((e: unknown) => e);
    backend
      .expectOne(`${API}/api/v1/wishlist`)
      .flush({ errorCode: 'LIMIT_REACHED', status: 429 }, { status: 429, statusText: 'Too Many' });
    await result;
    expect(show).not.toHaveBeenCalled();
  });
});
