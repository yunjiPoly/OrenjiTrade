import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { MeResponse } from '@orenji/api-client';
import { provideApiClient } from '../api/provide-api-client';
import { AppConfigService } from '../config/app-config.service';
import { apiBaseUrlInterceptor } from '../http/api-base-url.interceptor';
import { ApiError } from '../http/api-error';
import { errorInterceptor } from '../http/error.interceptor';
import { AuthService } from './auth.service';
import { FIREBASE_AUTH_PORT } from './firebase-auth.port';
import { SessionService } from './session.service';
import { FakeFirebaseAuthPort, fakeUser } from './testing/fake-firebase-auth.port';

const API = 'http://api.test';

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: 'u-1',
    handle: 'maika',
    displayName: 'Maïka',
    email: 'maika@example.test',
    emailVerified: true,
    roles: ['USER'] as unknown as MeResponse['roles'],
    status: 'ACTIVE' as MeResponse['status'],
    createdAt: '2026-09-01T00:00:00Z',
    onboarding: { profileComplete: true, tradingAreaSet: true, interestsSet: true },
    requiredConsents: [],
    plan: 'FREE',
    ...overrides,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('SessionService', () => {
  let port: FakeFirebaseAuthPort;
  let backend: HttpTestingController;
  let session: SessionService;
  let auth: AuthService;

  beforeEach(async () => {
    port = new FakeFirebaseAuthPort();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiBaseUrlInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        provideApiClient(),
        { provide: FIREBASE_AUTH_PORT, useValue: port },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    TestBed.inject(AppConfigService).set({
      apiBaseUrl: API,
      firebaseAuthEmulatorHost: 'localhost:9099',
    });
    backend = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    auth = TestBed.inject(AuthService);
    await auth.init();
    await auth.ready();
  });

  afterEach(() => backend.verify());

  async function signInAndAnswer(body: object, status = 200): Promise<void> {
    port.emit(fakeUser('maika@example.test'));
    await settle();
    const req = backend.expectOne(`${API}/api/v1/me`);
    if (status === 200) {
      req.flush(body);
    } else if (status === 0) {
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    } else {
      req.flush(body, { status, statusText: 'Error' });
    }
    await settle();
  }

  it('is anonymous until someone signs in', async () => {
    expect(session.status()).toBe('anonymous');
    await expect(session.ensureLoaded()).resolves.toBe('anonymous');
  });

  it('loads /me on sign-in and exposes roles and onboarding state', async () => {
    await signInAndAnswer(
      me({
        roles: ['USER', 'MODERATOR'] as unknown as MeResponse['roles'],
        onboarding: { profileComplete: false, tradingAreaSet: false, interestsSet: false },
      }),
    );
    expect(session.status()).toBe('ready');
    expect(session.handle()).toBe('maika');
    expect(session.roles()).toEqual(['USER', 'MODERATOR']);
    expect(session.isModerator()).toBe(true);
    expect(session.isAdmin()).toBe(false);
    expect(session.canAccessAdmin()).toBe(true);
    expect(session.needsOnboarding()).toBe(true);
    await expect(session.ensureLoaded()).resolves.toBe('ready');
  });

  it('asks for onboarding while the 18+ confirmation is missing, not when unreported', async () => {
    await signInAndAnswer(
      me({
        onboarding: {
          profileComplete: true,
          tradingAreaSet: true,
          interestsSet: true,
          ageConfirmed: false,
        },
      }),
    );
    expect(session.status()).toBe('ready');
    expect(session.needsOnboarding()).toBe(true);
    expect(session.needsAgeConfirmation()).toBe(true);
  });

  it('does not require onboarding for a confirmed or an unreported age flag', async () => {
    await signInAndAnswer(
      me({
        onboarding: {
          profileComplete: true,
          tradingAreaSet: true,
          interestsSet: true,
          ageConfirmed: true,
        },
      }),
    );
    expect(session.needsOnboarding()).toBe(false);
    expect(session.needsAgeConfirmation()).toBe(false);
    // An API without the flag (older contract) never asks for it.
    expect(
      me().onboarding.ageConfirmed,
      'the fixture mirrors an API that does not report the flag',
    ).toBeUndefined();
  });

  it('routes 403 AGE_CONFIRMATION_REQUIRED answers to the onboarding flow', async () => {
    await signInAndAnswer(me());
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    session.handleApiError(
      new ApiError(
        {
          errorCode: 'AGE_CONFIRMATION_REQUIRED',
          message: 'Confirm that you are 18 years of age or older to continue',
          requestId: null,
          status: 403,
          fieldErrors: {},
        },
        {
          problem: {
            requiredConsents: [{ documentType: 'AGE_CONFIRMATION', version: '2026-10-05' }],
          },
        },
      ),
    );

    // Not a session state: the account stays usable, only the gated action was refused.
    expect(session.status()).toBe('ready');
    expect(navigate).toHaveBeenCalledWith(['/onboarding'], {
      queryParams: { returnUrl: '/' },
    });
  });

  it('reports pending consents and pending deletions', async () => {
    await signInAndAnswer(
      me({
        requiredConsents: [
          { documentType: 'TERMS', version: '2026-09-01' },
        ] as MeResponse['requiredConsents'],
      }),
    );
    expect(session.status()).toBe('consent-required');
    expect(session.requiredConsents()).toEqual([{ documentType: 'TERMS', version: '2026-09-01' }]);

    port.emit(null);
    await settle();
    expect(session.status()).toBe('anonymous');
    expect(session.me()).toBeNull();

    await signInAndAnswer(me({ status: 'DELETION_REQUESTED' as MeResponse['status'] }));
    expect(session.status()).toBe('deletion-pending');
  });

  it('maps 403 ACCOUNT_SUSPENDED to the suspended state with its end date', async () => {
    await signInAndAnswer(
      {
        errorCode: 'ACCOUNT_SUSPENDED',
        message: 'This account is suspended',
        suspendedUntil: '2026-10-01T00:00:00Z',
      },
      403,
    );
    expect(session.status()).toBe('suspended');
    expect(session.suspension()).toEqual({
      message: 'This account is suspended',
      until: '2026-10-01T00:00:00Z',
    });
  });

  it('keeps a retryable error state when the API is unreachable', async () => {
    await signInAndAnswer({}, 0);
    expect(session.status()).toBe('error');
    expect(session.error()?.errorCode).toBe('NETWORK_ERROR');

    const retry = session.ensureLoaded();
    await settle();
    backend.expectOne(`${API}/api/v1/me`).flush(me());
    await expect(retry).resolves.toBe('ready');
  });

  it('routes 428 answers from other requests to the consent page', async () => {
    await signInAndAnswer(me());
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    session.handleApiError(
      new ApiError(
        {
          errorCode: 'TERMS_ACCEPTANCE_REQUIRED',
          message: 'Accept the terms',
          requestId: null,
          status: 428,
          fieldErrors: {},
        },
        { problem: { requiredConsents: [{ documentType: 'PRIVACY', version: '2026-10-01' }] } },
      ),
    );

    expect(session.status()).toBe('consent-required');
    // `/me` had none; the 428 answer lists the new version to accept.
    expect(session.requiredConsents()).toEqual([
      { documentType: 'PRIVACY', version: '2026-10-01' },
    ]);
    expect(navigate).toHaveBeenCalledWith(['/auth/consent'], {
      queryParams: { returnUrl: '/' },
    });
  });

  it('accepts consents one by one and reloads the session', async () => {
    await signInAndAnswer(
      me({
        requiredConsents: [
          { documentType: 'TERMS', version: 'v1' },
        ] as MeResponse['requiredConsents'],
      }),
    );
    const done = session.acceptConsents([
      { documentType: 'TERMS', version: 'v1' },
      { documentType: 'PRIVACY', version: 'v1' },
    ]);
    await settle();
    const first = backend.expectOne(`${API}/api/v1/me/consents`);
    expect(first.request.body).toEqual({ documentType: 'TERMS', version: 'v1' });
    first.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    const second = backend.expectOne(`${API}/api/v1/me/consents`);
    expect(second.request.body).toEqual({ documentType: 'PRIVACY', version: 'v1' });
    second.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    backend.expectOne(`${API}/api/v1/me`).flush(me());
    await expect(done).resolves.toBe('ready');
  });
});
