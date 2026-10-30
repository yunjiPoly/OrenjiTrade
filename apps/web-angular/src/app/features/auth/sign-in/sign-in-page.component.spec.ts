import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { SignInPageComponent } from './sign-in-page.component';

describe('SignInPageComponent', () => {
  let fixture: ComponentFixture<SignInPageComponent>;
  let element: HTMLElement;
  let signInWithEmail: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;
  let status: string;
  let needsOnboarding: boolean;

  beforeEach(async () => {
    signInWithEmail = vi.fn(async () => ({ uid: 'u-1' }));
    status = 'ready';
    needsOnboarding = false;
    TestBed.configureTestingModule({
      imports: [SignInPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            available: signal(true),
            signInWithEmail,
            signInWithGoogle: vi.fn(),
            isAuthenticated: signal(false),
          },
        },
        {
          provide: SessionService,
          useValue: {
            ensureLoaded: async () => status,
            needsOnboarding: () => needsOnboarding,
            status: signal('anonymous'),
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(SignInPageComponent);
    fixture.componentRef.setInput('returnUrl', '/settings/privacy');
    fixture.detectChanges();
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  function fill(email: string, password: string): void {
    const inputs = element.querySelectorAll<HTMLInputElement>('input');
    inputs[0].value = email;
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = password;
    inputs[1].dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows inline validation instead of calling Firebase for an empty form', async () => {
    await submit();
    expect(signInWithEmail).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Enter your email address.');
    expect(element.textContent).toContain('Enter your password.');
  });

  it('signs in and returns to the requested page', async () => {
    fill('maika@example.test', 'secret-pass');
    await submit();
    expect(signInWithEmail).toHaveBeenCalledWith('maika@example.test', 'secret-pass');
    expect(navigateByUrl).toHaveBeenCalledWith('/settings/privacy');
  });

  it('sends unfinished accounts to onboarding', async () => {
    needsOnboarding = true;
    fill('maika@example.test', 'secret-pass');
    await submit();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/onboarding'], {
      queryParams: { returnUrl: '/settings/privacy' },
    });
  });

  it('is board W27: "Not now, keep browsing" back to the page, the h1 for screen readers', () => {
    const close = element.querySelector('[data-testid="auth-close"]');
    expect(close?.textContent).toContain('Not now, keep browsing');
    expect(close?.getAttribute('href')).toBe('/settings/privacy');
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Sign in to OrenjiTrade');
    expect(element.textContent).toContain('Forgot your password?');
    expect(element.textContent).toContain('Continue with Google');
    expect(element.querySelector('#si-email')?.getAttribute('aria-invalid')).toBeNull();
  });

  it('a problem marks its field and describes it', async () => {
    await submit();
    const email = element.querySelector('#si-email')!;
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toBe('si-email-error');
  });

  it('sends an account that could not load to "We could not load your account"', async () => {
    status = 'error';
    fill('maika@example.test', 'secret-pass');
    await submit();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/auth/unavailable'], {
      queryParams: { returnUrl: '/settings/privacy' },
    });
  });

  it('shows a friendly message for wrong credentials', async () => {
    signInWithEmail.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    fill('maika@example.test', 'nope-nope');
    await submit();
    expect(element.querySelector('[role=alert]')?.textContent).toContain(
      'No account matches these credentials.',
    );
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
