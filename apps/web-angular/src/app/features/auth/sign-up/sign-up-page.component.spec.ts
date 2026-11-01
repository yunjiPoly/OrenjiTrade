import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Router, provideRouter } from '@angular/router';
import { LegalDocument } from '@orenji/api-client';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
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
  let updateDisplayName: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    signUpWithEmail = vi.fn(async () => ({ uid: 'u-1' }));
    updateDisplayName = vi.fn(async () => undefined);
    acceptConsents = vi.fn(async () => 'ready');
    ageConfirmation = AGE;
    TestBed.configureTestingModule({
      imports: [SignUpPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            available: signal(true),
            user: signal(null),
            signUpWithEmail,
            updateDisplayName,
            getIdToken: vi.fn(async () => 'token'),
            isAuthenticated: signal(false),
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

  function type(id: string, value: string): void {
    const input = element.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function fillAccount(): void {
    type('su-name', 'New Bie');
    type('su-email', 'newbie@example.test');
    type('su-password', 'secret-pass-123');
  }

  function acceptDocuments(): void {
    // "Accept all" is the first row of the documents card.
    element.querySelector<HTMLInputElement>('.docs__row--all input')!.click();
    fixture.detectChanges();
  }

  function ageBox(): HTMLInputElement {
    return element.querySelector<HTMLInputElement>('[data-testid="age-confirmation"] input')!;
  }

  function reason(): string {
    return element.querySelector('#su-why')?.textContent?.trim() ?? '';
  }

  async function submit(): Promise<void> {
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows an unticked 18+ checkbox, in English only, that "Accept all" never ticks', () => {
    expect(ageBox().checked).toBe(false);
    acceptDocuments();
    expect(ageBox().checked).toBe(false);
    expect(element.textContent).toContain('I confirm I am 18 years of age or older');
    expect(element.textContent).not.toContain('Je confirme');
    expect(element.textContent).toContain('I accept the Terms of Service');
    const read = element.querySelector('.docs__read')!;
    expect(read.getAttribute('aria-label')).toBe('Read the Terms of Service, opens in a new tab');
    expect(read.getAttribute('target')).toBe('_blank');
  });

  it('"Create account" waits with the reason line until every box is ticked', async () => {
    const button = element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(reason()).toBe('Accept the documents and confirm your age to continue.');
    fillAccount();
    await submit();
    expect(signUpWithEmail).not.toHaveBeenCalled();
    // The press turns the line amber; the fields are not judged yet (board W27).
    expect(element.querySelector('.create__why--warn')).not.toBeNull();
    expect(element.querySelector('.docs--warn')).not.toBeNull();
    acceptDocuments();
    expect(reason()).toBe('Confirm that you are 18 or older to continue.');
    await submit();
    expect(signUpWithEmail).not.toHaveBeenCalled();
    expect(acceptConsents).not.toHaveBeenCalled();
    ageBox().click();
    fixture.detectChanges();
    expect(reason()).toBe('');
    expect(button.getAttribute('aria-disabled')).toBeNull();
  });

  it('asks for a display name once every box is ticked', async () => {
    acceptDocuments();
    ageBox().click();
    type('su-email', 'newbie@example.test');
    type('su-password', 'secret-pass-123');
    await submit();
    expect(signUpWithEmail).not.toHaveBeenCalled();
    expect(element.querySelector('#su-name-error')?.textContent).toContain('Enter a display name.');
    expect(element.querySelector('#su-name')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('creates the account with its display name, then records the documents and the age', async () => {
    fillAccount();
    acceptDocuments();
    ageBox().click();
    fixture.detectChanges();
    await submit();

    expect(signUpWithEmail).toHaveBeenCalledWith('newbie@example.test', 'secret-pass-123');
    expect(updateDisplayName).toHaveBeenCalledWith('New Bie');
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

  // WG review A5: a refused press is said, and the first field to fix takes the focus.
  it('a blocked press says its reason again; refused fields focus the first one', async () => {
    const announce = vi.spyOn(TestBed.inject(LiveAnnouncer), 'announce');
    fillAccount();
    await submit();
    expect(announce).toHaveBeenCalledWith(
      'Accept the documents and confirm your age to continue.',
      'polite',
    );
    acceptDocuments();
    ageBox().click();
    type('su-name', '');
    type('su-email', 'not-an-email');
    await submit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement?.id).toBe('su-name');
    type('su-name', 'New Bie');
    await submit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement?.id).toBe('su-email');
    expect(signUpWithEmail).not.toHaveBeenCalled();
  });
});
