import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { provideApiClient } from '../api/provide-api-client';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_AUTH_PORT } from '../auth/firebase-auth.port';
import { FakeFirebaseAuthPort, fakeUser } from '../auth/testing/fake-firebase-auth.port';
import { AppConfigService } from '../config/app-config.service';
import { apiBaseUrlInterceptor } from '../http/api-base-url.interceptor';
import { errorInterceptor } from '../http/error.interceptor';
import { FeatureFlagsService, provideFeatureFlags } from './feature-flags.service';
import { featureGuard } from './feature.guard';

const API = 'http://api.test';

@Component({ template: '' })
class BlankComponent {}
const FLAGS_URL = `${API}/api/v1/public/feature-flags`;

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('FeatureFlagsService', () => {
  let port: FakeFirebaseAuthPort;
  let backend: HttpTestingController;
  let flags: FeatureFlagsService;
  let snackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    port = new FakeFirebaseAuthPort();
    snackBar = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'auth/sign-in', component: BlankComponent },
          { path: 'map', component: BlankComponent },
        ]),
        provideFeatureFlags(),
        provideHttpClient(withInterceptors([apiBaseUrlInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        provideApiClient(),
        { provide: FIREBASE_AUTH_PORT, useValue: port },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    TestBed.inject(AppConfigService).set({
      apiBaseUrl: API,
      firebaseAuthEmulatorHost: 'localhost:9099',
    });
    backend = TestBed.inject(HttpTestingController);
    flags = TestBed.inject(FeatureFlagsService);
    await TestBed.inject(AuthService).init();
  });

  afterEach(() => backend.verify());

  it('reports every flag off until the first answer, then the server values', async () => {
    expect(flags.isEnabled('premiumPlans')).toBe(false);
    const premium = flags.enabled('premiumPlans');
    const loading = flags.load();
    await settle();
    backend.expectOne(FLAGS_URL).flush({ premiumPlans: true, mlScanning: false });
    await loading;

    expect(flags.status()).toBe('ready');
    expect(premium()).toBe(true);
    expect(flags.isEnabled('mlScanning')).toBe(false);
    expect(flags.isEnabled('unknownFlag')).toBe(false);
  });

  it('keeps the previous values and reports the error when a reload fails', async () => {
    const first = flags.load();
    await settle();
    backend.expectOne(FLAGS_URL).flush({ publicChat: true });
    await first;

    const second = flags.load();
    await settle();
    backend
      .expectOne(FLAGS_URL)
      .flush({ errorCode: 'INTERNAL_ERROR' }, { status: 500, statusText: 'Server Error' });
    await second;

    expect(flags.status()).toBe('error');
    expect(flags.error()?.status).toBe(500);
    expect(flags.isEnabled('publicChat')).toBe(true);
  });

  it('shares one request between concurrent loads', async () => {
    const a = flags.load();
    const b = flags.load();
    await settle();
    backend.expectOne(FLAGS_URL).flush({ credits: true });
    await Promise.all([a, b]);
    expect(flags.isEnabled('credits')).toBe(true);
  });

  it('evaluates again for a newly signed-in collector', async () => {
    const first = flags.load();
    await settle();
    backend.expectOne(FLAGS_URL).flush({ premiumPlans: false });
    await first;

    port.emit(fakeUser('maika@example.test'));
    await settle();
    const reload = backend.expectOne(FLAGS_URL);
    reload.flush({ premiumPlans: true });
    await settle();
    expect(flags.isEnabled('premiumPlans')).toBe(true);
  });

  it('waits on account pages and evaluates for the account once the visitor signs in', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/auth/sign-in');
    await settle();
    backend.expectNone(FLAGS_URL);
    expect(flags.status()).toBe('idle');

    port.emit(fakeUser('maika@example.test'));
    await settle();
    const req = backend.expectOne(FLAGS_URL);
    req.flush({ premiumPlans: true });
    await settle();
    expect(flags.isEnabled('premiumPlans')).toBe(true);
  });

  it('loads on the first navigation outside the account pages', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/auth/sign-in');
    await settle();
    backend.expectNone(FLAGS_URL);
    await router.navigateByUrl('/map');
    await settle();
    backend.expectOne(FLAGS_URL).flush({ publicChat: true });
    await settle();
    expect(flags.isEnabled('publicChat')).toBe(true);
    await router.navigateByUrl('/auth/sign-in');
    await router.navigateByUrl('/map');
    await settle();
    backend.expectNone(FLAGS_URL);
  });

  it('guards a flag-gated route: in when on, redirected with a message when off', async () => {
    flags.set({ publicChat: true, donations: false });
    const allowed = await TestBed.runInInjectionContext(() =>
      featureGuard('publicChat', 'Community')(undefined as never, undefined as never),
    );
    expect(allowed).toBe(true);

    const denied = await TestBed.runInInjectionContext(() =>
      featureGuard('donations', 'Donations')(undefined as never, undefined as never),
    );
    expect(denied instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(denied as UrlTree)).toBe('/map');
    expect(snackBar.open).toHaveBeenCalledWith(
      'Donations is not available right now.',
      'OK',
      expect.anything(),
    );
  });
});
