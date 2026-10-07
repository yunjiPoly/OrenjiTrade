import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepper } from '@angular/material/stepper';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { MeResponse } from '@orenji/api-client';
import { provideApiClient } from '../../core/api/provide-api-client';
import { SessionService } from '../../core/auth/session.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { AGE_CONFIRMATION_ERROR } from '../../shared/legal/age-confirmation-checkbox.component';
import { MyLocationStore } from '../../shared/location/my-location.store';
import { GamesStore } from '../../shared/catalog/games.store';
import { MyProfileStore } from '../../shared/profile/my-profile.store';
import { LegalDocumentsStore } from '../auth/data/legal-documents.store';
import { OnboardingPageComponent } from './onboarding-page.component';

const AGE_DOCUMENT = {
  documentType: 'AGE_CONFIRMATION',
  version: '2026-10-05',
  title: 'Age confirmation',
  url: '/legal#age-confirmation',
  requiredAtRegistration: false,
};

/** Lets the page's async `load()` and the promise chains of its actions settle (zoneless). */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function me(onboarding: MeResponse['onboarding']): MeResponse {
  return {
    id: 'u-1',
    handle: 'maika',
    displayName: 'Maïka',
    email: 'maika@example.test',
    emailVerified: true,
    roles: ['USER'] as unknown as MeResponse['roles'],
    status: 'ACTIVE' as MeResponse['status'],
    createdAt: '2026-09-01T00:00:00Z',
    onboarding,
    requiredConsents: [],
    plan: 'FREE',
  };
}

describe('OnboardingPageComponent (18+ confirmation step)', () => {
  let fixture: ComponentFixture<OnboardingPageComponent>;
  let element: HTMLElement;
  let acceptConsents: ReturnType<typeof vi.fn>;
  let snackOpen: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  async function mount(onboarding: MeResponse['onboarding']): Promise<void> {
    acceptConsents = vi.fn(async () => 'ready');
    snackOpen = vi.fn();
    const meState = signal<MeResponse | null>(me(onboarding));
    TestBed.configureTestingModule({
      imports: [OnboardingPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClient(),
        { provide: MatSnackBar, useValue: { open: snackOpen } },
        {
          provide: SessionService,
          useValue: {
            me: meState,
            acceptConsents,
            load: vi.fn(async () => 'ready'),
          },
        },
        {
          provide: MyProfileStore,
          useValue: {
            error: signal(null),
            load: vi.fn(async () => ({
              handle: 'maika',
              displayName: 'Maïka',
              bio: '',
              games: ['yugioh'],
              languages: ['en'],
              tags: [],
              avatarUrl: null,
              completedAt: '2026-09-01T00:00:00Z',
            })),
            save: vi.fn(),
            saveTags: vi.fn(),
          },
        },
        {
          provide: MyLocationStore,
          useValue: {
            error: signal(null),
            location: signal(null),
            privacy: signal(null),
            load: vi.fn(async () => true),
            saveTradingArea: vi.fn(),
            savePrivacy: vi.fn(),
          },
        },
        {
          provide: LegalDocumentsStore,
          useValue: {
            error: signal(null),
            load: vi.fn(async () => undefined),
            ageConfirmation: () => AGE_DOCUMENT,
          },
        },
        {
          provide: GamesStore,
          useValue: {
            games: signal([]),
            loading: signal(false),
            error: signal(null),
            load: vi.fn(),
          },
        },
      ],
    });
    TestBed.inject(AppConfigService).set({
      apiBaseUrl: 'http://api.test',
      firebaseAuthEmulatorHost: 'localhost:9099',
    });
    const router = TestBed.inject(Router);
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(OnboardingPageComponent);
    fixture.componentRef.setInput('returnUrl', '/messages');
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  async function clickContinue(): Promise<void> {
    continueButton().click();
    await settle();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function ageBox(): HTMLInputElement {
    return element.querySelector<HTMLInputElement>('[data-testid="age-confirmation"] input')!;
  }

  function continueButton(): HTMLButtonElement {
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('button'));
    return buttons.find((button) => button.textContent?.trim() === 'Continue')!;
  }

  function stepper(): MatStepper {
    return fixture.debugElement.query(By.directive(MatStepper)).componentInstance as MatStepper;
  }

  it('asks an existing account to confirm first and sends it straight back afterwards', async () => {
    await mount({
      profileComplete: true,
      tradingAreaSet: true,
      interestsSet: true,
      ageConfirmed: false,
    });

    expect(element.textContent).toContain('Are you 18 or older?');
    expect(stepper().selectedIndex).toBe(0);
    expect(ageBox().checked).toBe(false);

    // Submitting without the tick shows the message and records nothing.
    await clickContinue();
    expect(acceptConsents).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(AGE_CONFIRMATION_ERROR);

    ageBox().click();
    fixture.detectChanges();
    await clickContinue();

    expect(acceptConsents).toHaveBeenCalledWith([
      { documentType: 'AGE_CONFIRMATION', version: '2026-10-05' },
    ]);
    expect(snackOpen).toHaveBeenCalledWith(
      'Thanks for confirming. Welcome back!',
      'OK',
      expect.anything(),
    );
    expect(navigateByUrl).toHaveBeenCalledWith('/messages');
  });

  it('continues to the profile step for a new account', async () => {
    await mount({
      profileComplete: false,
      tradingAreaSet: false,
      interestsSet: false,
      ageConfirmed: false,
    });

    expect(stepper().selectedIndex).toBe(0);
    ageBox().click();
    fixture.detectChanges();
    await clickContinue();

    expect(acceptConsents).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(stepper().selectedIndex).toBe(1);
    expect(stepper().steps.first.label).toBe('Age');
    expect(stepper().steps.first.completed).toBe(true);
  });

  it('skips the step when the API reports the confirmation', async () => {
    await mount({
      profileComplete: false,
      tradingAreaSet: false,
      interestsSet: false,
      ageConfirmed: true,
    });

    expect(element.textContent).not.toContain('Are you 18 or older?');
    expect(ageBox()).toBeNull();
    expect(stepper().steps.first.label).toBe('Profile');
  });

  it('skips the step when an older API does not report the flag at all', async () => {
    await mount({ profileComplete: false, tradingAreaSet: false, interestsSet: false });

    expect(ageBox()).toBeNull();
    expect(stepper().steps.first.label).toBe('Profile');
  });
});
