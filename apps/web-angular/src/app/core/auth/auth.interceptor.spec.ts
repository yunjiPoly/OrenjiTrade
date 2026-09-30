import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';
import { acceptHeaderInterceptor } from '../http/accept-header.interceptor';
import { apiBaseUrlInterceptor } from '../http/api-base-url.interceptor';
import { isApiError } from '../http/api-error';
import { errorInterceptor } from '../http/error.interceptor';
import { ATTACH_ID_TOKEN } from '../http/http-context';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const API = 'http://api.test';

/** Waits for the interceptor's async token lookup before the request reaches the backend. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let token: string | null;
  let refreshes: number;

  beforeEach(() => {
    token = 'token-1';
    refreshes = 0;
    const fakeAuth = {
      ready: () => Promise.resolve(),
      getIdToken: async (force = false) => {
        if (force && token) {
          refreshes++;
          token = `token-${refreshes + 1}`;
        }
        return token;
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([
            apiBaseUrlInterceptor,
            acceptHeaderInterceptor,
            authInterceptor,
            errorInterceptor,
          ]),
        ),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: fakeAuth },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    TestBed.inject(AppConfigService).set({ apiBaseUrl: API });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('adds the bearer token to protected API routes', async () => {
    const response = firstValueFrom(http.get('/api/v1/me'));
    await settle();
    const req = backend.expectOne(`${API}/api/v1/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    req.flush({ ok: true });
    await expect(response).resolves.toEqual({ ok: true });
  });

  it('never sends the token to public routes or other origins', async () => {
    http.get('/api/v1/public/legal/documents').subscribe();
    http.get('/api/v1/meta').subscribe();
    http.get('https://tile.example.test/1/2/3.png').subscribe();
    await settle();
    for (const url of [
      `${API}/api/v1/public/legal/documents`,
      `${API}/api/v1/meta`,
      'https://tile.example.test/1/2/3.png',
    ]) {
      const req = backend.expectOne(url);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    }
  });

  it('sends the token to a public route that asks for it (per-account flag rollouts)', async () => {
    http
      .get('/api/v1/public/feature-flags', {
        context: new HttpContext().set(ATTACH_ID_TOKEN, true),
      })
      .subscribe();
    await settle();
    const req = backend.expectOne(`${API}/api/v1/public/feature-flags`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    req.flush({});
  });

  it('sends no header while signed out', async () => {
    token = null;
    http.get('/api/v1/collectors/maika').subscribe({ error: () => undefined });
    await settle();
    const req = backend.expectOne(`${API}/api/v1/collectors/maika`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
  });

  it('retries once with a force-refreshed token after a 401', async () => {
    const response = firstValueFrom(http.get('/api/v1/me/profile'));
    await settle();
    backend
      .expectOne(`${API}/api/v1/me/profile`)
      .flush({ errorCode: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    await settle();
    const retry = backend.expectOne(`${API}/api/v1/me/profile`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer token-2');
    retry.flush({ handle: 'maika' });
    await expect(response).resolves.toEqual({ handle: 'maika' });
    expect(refreshes).toBe(1);
  });

  it('does not retry REAUTHENTICATION_REQUIRED (a fresh sign-in is needed)', async () => {
    const reauth = firstValueFrom(http.post('/api/v1/me/deletion-requests', {})).catch(
      (e: unknown) => e,
    );
    await settle();
    backend
      .expectOne(`${API}/api/v1/me/deletion-requests`)
      .flush(
        { errorCode: 'REAUTHENTICATION_REQUIRED', status: 401 },
        { status: 401, statusText: 'Unauthorized' },
      );
    const error = await reauth;
    expect(isApiError(error) && error.errorCode).toBe('REAUTHENTICATION_REQUIRED');
    expect(refreshes).toBe(0);
  });

  it('widens Accept for operations that only accept problem details', async () => {
    http
      .delete('/api/v1/me/location', { headers: { Accept: 'application/problem+json' } })
      .subscribe();
    await settle();
    const req = backend.expectOne(`${API}/api/v1/me/location`);
    expect(req.request.headers.get('Accept')).toBe('application/json, application/problem+json');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
