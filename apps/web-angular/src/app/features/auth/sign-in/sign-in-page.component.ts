import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { authErrorCode, authErrorMessage, isPopupDismissed } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { routeAfterSignIn } from '../auth-navigation';
import { GoogleButtonComponent } from '../google-button/google-button.component';

/**
 * `/auth/sign-in` (spec 14, board W27): "Not now, keep browsing", the wordmark and "Find collectors
 * in your region…", email and password (48 each, "Show"), "Forgot your password?", [Sign in]
 * (orange 52), "or", [Continue with Google] (outline 52), "New to OrenjiTrade? Create an account";
 * then onward to wherever the collector was going (`?returnUrl=`, the pending action of a guest
 * finishing there).
 */
@Component({
  selector: 'app-sign-in-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ShellIconComponent,
    AuthLayoutComponent,
    GoogleButtonComponent,
  ],
  templateUrl: './sign-in-page.component.html',
  styleUrl: '../auth-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  protected readonly auth = inject(AuthService);

  /** Bound from `?returnUrl=`. */
  readonly returnUrl = input<string | undefined>();

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  protected readonly submitting = signal(false);
  protected readonly googleBusy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hidePassword = signal(true);
  protected readonly submitted = signal(false);

  /** A field's message shows once it was left or a submit was tried. */
  protected shows(name: 'email' | 'password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    try {
      await this.auth.signInWithEmail(email, password);
      await routeAfterSignIn(this.session, this.router, this.returnUrl());
    } catch (error) {
      this.error.set(authErrorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async google(): Promise<void> {
    this.error.set(null);
    this.googleBusy.set(true);
    try {
      await this.auth.signInWithGoogle();
      await routeAfterSignIn(this.session, this.router, this.returnUrl());
    } catch (error) {
      if (!isPopupDismissed(error) || authErrorCode(error) === 'auth/popup-blocked') {
        this.error.set(authErrorMessage(error));
      }
    } finally {
      this.googleBusy.set(false);
    }
  }
}
