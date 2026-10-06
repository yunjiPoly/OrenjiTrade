import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LegalDocument } from '@orenji/api-client';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { AGE_CONFIRMATION_ERROR } from '../../../shared/legal/age-confirmation-checkbox.component';
import { LegalDocumentsStore } from '../data/legal-documents.store';
import { SignUpPageComponent } from './sign-up-page.component';

function doc(documentType: string, version: string, url: string, title: string): LegalDocument {
  return {
    documentType: documentType as LegalDocument['documentType'],
    version,
    title,
    url,
    requiredAtRegistration: true,
  };
}

const TERMS = doc('TERMS', '2026-09-01', '/legal/terms', 'Terms of Service');
const PRIVACY = doc('PRIVACY', '2026-09-01', '/legal/privacy', 'Privacy Policy');
const AGE = doc('AGE_CONFIRMATION', '2026-10-05', '/legal#age-confirmation', 'Age confirmation');

describe('SignUpPageComponent', () => {
  let fixture: ComponentFixture<SignUpPageComponent>;
  let element: HTMLElement;
  let signUpWithEmail: ReturnType<typeof vi.fn>;
  let acceptConsents: ReturnType<typeof vi.fn>;
  let ageConfirmation: LegalDocument | null;

  beforeEach(async () => {
    signUpWithEmail = vi.fn(async () => ({ uid: 'u-1' }));
    acceptConsents = vi.fn(async () => 'ready');
    ageConfirmation = AGE;
    TestBed.configureTestingModule({
      imports: [SignUpPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            available: signal(true),
            user: signal(null),
            signUpWithEmail,
            sendEmailVerification: vi.fn(async () => undefined),
            signInWithGoogle: vi.fn(),
          },
        },
        { provide: SessionService, useValue: { acceptConsents } },
        {
          provide: LegalDocumentsStore,
          useValue: {
            load: vi.fn(async () => undefined),
            loading: signal(false),
            error: signal(null),
            documents: signal([TERMS, PRIVACY, AGE]),
            requiredAtRegistration: () => [TERMS, PRIVACY],
            ageConfirmation: () => ageConfirmation,
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(SignUpPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  function fillAccount(): void {
    const inputs = element.querySelectorAll<HTMLInputElement>('input');
    inputs[0].value = 'newbie@example.test';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = 'secret-pass-123';
    inputs[1].dispatchEvent(new Event('input'));
  }

  function acceptDocuments(): void {
    // "Accept all" is the first checkbox of the consent list.
    element.querySelector<HTMLInputElement>('.consents__all input')!.click();
    fixture.detectChanges();
  }

  function ageBox(): HTMLInputElement {
    return element.querySelector<HTMLInputElement>('[data-testid="age-confirmation"] input')!;
  }

  async function submit(): Promise<void> {
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows an unticked 18+ checkbox that "Accept all" never ticks', () => {
    expect(ageBox().checked).toBe(false);
    acceptDocuments();
    expect(ageBox().checked).toBe(false);
    expect(element.textContent).toContain('I confirm I am 18 years of age or older');
    expect(element.textContent).toContain('Je confirme avoir 18 ans ou plus');
  });

  it('refuses to create the account until the age is confirmed', async () => {
    fillAccount();
    acceptDocuments();
    await submit();

    expect(signUpWithEmail).not.toHaveBeenCalled();
    expect(acceptConsents).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(AGE_CONFIRMATION_ERROR);
  });

  it('records the documents and the age confirmation server-side after sign-up', async () => {
    fillAccount();
    acceptDocuments();
    ageBox().click();
    fixture.detectChanges();
    await submit();

    expect(signUpWithEmail).toHaveBeenCalledWith('newbie@example.test', 'secret-pass-123');
    expect(acceptConsents).toHaveBeenCalledTimes(1);
    expect(acceptConsents).toHaveBeenCalledWith([
      { documentType: 'TERMS', version: '2026-09-01' },
      { documentType: 'PRIVACY', version: '2026-09-01' },
      { documentType: 'AGE_CONFIRMATION', version: '2026-10-05' },
    ]);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
      ['/auth/verify-email'],
      expect.anything(),
    );
  });
});
