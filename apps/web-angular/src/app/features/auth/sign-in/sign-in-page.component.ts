import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { authErrorCode, authErrorMessage, isPopupDismissed } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { routeAfterSignIn } from '../auth-navigation';
import { GoogleButtonComponent } from '../google-button/google-button.component';

/** `/auth/sign-in`: email + password or Google, then onward to wherever the collector was going. */
@Component({
  selector: 'app-sign-in-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
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

  protected async submit(): Promise<void> {
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
