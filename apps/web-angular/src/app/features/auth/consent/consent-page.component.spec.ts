import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LegalDocument, MeResponse, RequiredConsent } from '@orenji/api-client';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService, SessionStatus } from '../../../core/auth/session.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { LegalTextsService } from '../../legal/legal-texts.service';
import { LegalDocumentsStore } from '../data/legal-documents.store';
import { CONSENT_COPY, ConsentPageComponent } from './consent-page.component';

const AGE: LegalDocument = {
  documentType: 'AGE_CONFIRMATION' as LegalDocument['documentType'],
  version: '2026-10-05',
  title: 'Age confirmation',
  url: '/legal#age-confirmation',
  requiredAtRegistration: true,
};

const TERMS_DUE: RequiredConsent = {
  documentType: 'TERMS' as RequiredConsent['documentType'],
  version: '2026-10-20',
} as RequiredConsent;

const PRIVACY_DUE: RequiredConsent = {
  documentType: 'PRIVACY' as RequiredConsent['documentType'],
  version: '2026-10-20',
} as RequiredConsent;

/**
 * Review our terms (spec 14, an account state; WG review F4): the documents due with the 18+ box,
 * or the age alone for an account from before the 18+ rule, as the phone asks it since R12.
 */
describe('ConsentPageComponent (Review our terms)', () => {
  let fixture: ComponentFixture<ConsentPageComponent>;
  let element: HTMLElement;
  let acceptConsents: ReturnType<typeof vi.fn>;
  let show: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;
  const required = signal<RequiredConsent[]>([]);
  const me = signal<MeResponse | null>(null);
  const status = signal<SessionStatus>('consent-required');

  async function render(consents: RequiredConsent[], ageConfirmed: boolean): Promise<void> {
    required.set(consents);
    me.set({ id: 'u-1', onboarding: { ageConfirmed } } as unknown as MeResponse);
    status.set('consent-required');
    acceptConsents = vi.fn(async () => {
      status.set('ready');
      return 'ready';
    });
    show = vi.fn();
    TestBed.configureTestingModule({
      imports: [ConsentPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { signOut: vi.fn(async () => undefined) } },
        {
          provide: SessionService,
          useValue: {
            status,
            me,
            error: signal(null),
            requiredConsents: required,
            needsOnboarding: () => false,
            ensureLoaded: vi.fn(async () => status()),
            acceptConsents,
          },
        },
        {
          provide: LegalDocumentsStore,
          useValue: {
            load: vi.fn(async () => undefined),
            documents: signal([AGE]),
            ageConfirmation: () => AGE,
            describe: (consent: RequiredConsent) => ({
              title: consent.documentType === 'TERMS' ? 'Terms of Service' : 'Privacy Policy',
              url: consent.documentType === 'TERMS' ? '/legal/terms' : '/legal/privacy',
            }),
          },
        },
        {
          provide: LegalTextsService,
          useValue: { titleOf: (_url: string, fallback: string) => fallback },
        },
        { provide: ToastService, useValue: { show } },
      ],
    });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(ConsentPageComponent);
    fixture.componentRef.setInput('returnUrl', '/cards/c-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // The documents and the account load (`reload`): then the form.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  function ageBox(): HTMLInputElement | null {
    return element.querySelector<HTMLInputElement>('[data-testid="age-confirmation"] input');
  }

  async function press(): Promise<void> {
    const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find((entry) =>
      entry.textContent?.includes('Accept and continue'),
    )!;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function tick(selector: string): void {
    element.querySelector<HTMLInputElement>(selector)!.click();
    fixture.detectChanges();
  }

  it('asks the documents due with the 18+ box; a refused press says why and records nothing', async () => {
    await render([TERMS_DUE, PRIVACY_DUE], false);
    expect(element.textContent).toContain(CONSENT_COPY.intro);
    expect(element.textContent).toContain('Terms of Service');
    expect(ageBox()).not.toBeNull();
    expect(ageBox()!.checked).toBe(false);
    // "Accept all" ticks the documents, never the age.
    tick('.docs__row--all input');
    expect(ageBox()!.checked).toBe(false);
    await press();
    expect(acceptConsents).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(CONSENT_COPY.missing);
  });

  it('records AGE_CONFIRMATION with the documents, then goes on where the collector was going', async () => {
    await render([TERMS_DUE, PRIVACY_DUE], false);
    tick('.docs__row--all input');
    tick('[data-testid="age-confirmation"] input');
    await press();
    expect(acceptConsents).toHaveBeenCalledWith([
      { documentType: 'TERMS', version: '2026-10-20' },
      { documentType: 'PRIVACY', version: '2026-10-20' },
      { documentType: 'AGE_CONFIRMATION', version: '2026-10-05' },
    ]);
    // Documents were due: no "Welcome back!" toast.
    expect(show).not.toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/cards/c-1');
  });

  it('asks the age alone for an account that never confirmed it, with the phone’s lead and toast', async () => {
    await render([], false);
    expect(element.textContent).toContain(CONSENT_COPY.ageOnlyIntro);
    expect(element.textContent).not.toContain(CONSENT_COPY.intro);
    expect(element.querySelector('.docs__row--all')).toBeNull();
    expect(ageBox()).not.toBeNull();
    await press();
    expect(acceptConsents).not.toHaveBeenCalled();
    // The refusal names the age only: the page shows no document (WG review A10).
    const refusal = element.querySelector('[role="alert"]')?.textContent?.trim();
    expect(refusal).toBe(CONSENT_COPY.ageOnlyMissing);
    tick('[data-testid="age-confirmation"] input');
    await press();
    expect(acceptConsents).toHaveBeenCalledWith([
      { documentType: 'AGE_CONFIRMATION', version: '2026-10-05' },
    ]);
    expect(show).toHaveBeenCalledWith({ title: CONSENT_COPY.welcomeBack });
    expect(navigateByUrl).toHaveBeenCalledWith('/cards/c-1');
  });

  it('an account that confirmed its age is asked the documents only', async () => {
    await render([TERMS_DUE, PRIVACY_DUE], true);
    expect(ageBox()).toBeNull();
    tick('.docs__row--all input');
    await press();
    expect(acceptConsents).toHaveBeenCalledWith([
      { documentType: 'TERMS', version: '2026-10-20' },
      { documentType: 'PRIVACY', version: '2026-10-20' },
    ]);
  });
});
