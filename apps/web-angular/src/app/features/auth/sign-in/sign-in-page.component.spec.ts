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
        {
          provide: AuthService,
          useValue: { available: signal(true), signInWithEmail, signInWithGoogle: vi.fn() },
        },
        {
          provide: SessionService,
          useValue: {
            ensureLoaded: async () => status,
            needsOnboarding: () => needsOnboarding,
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
