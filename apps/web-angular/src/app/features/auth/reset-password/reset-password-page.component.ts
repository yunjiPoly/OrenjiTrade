import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { authErrorCode, authErrorMessage } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';

/**
 * `/auth/reset-password`, Reset your password (spec 14, board W27; the sign-in panel): the email,
 * [Send reset link], "Back to sign in"; then Check your inbox ("If an account exists for {email}, a
 * reset link is on its way…", [Back to sign in], "Use another email"). It never reveals whether an
 * account exists for the address.
 */
@Component({
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, ShellIconComponent, AuthLayoutComponent],
  template: `
    @if (sent()) {
      <app-auth-layout heading="Check your inbox" icon="mail" closable [returnUrl]="returnUrl()">
        <p class="state__text" role="status">
          If an account exists for <strong class="strong">{{ form.controls.email.value }}</strong
          >, a reset link is on its way. Check your inbox and spam folder.
        </p>
        <a
          class="btn btn--primary btn--first"
          routerLink="/auth/sign-in"
          [queryParams]="{ returnUrl: returnUrl() ?? null }"
          >Back to sign in</a
        >
        <button type="button" class="link link--center" (click)="sent.set(false)">
          Use another email
        </button>
      </app-auth-layout>
    } @else {
      <app-auth-layout
        heading="Reset your password"
        lead="We will email you a link to choose a new password."
        closable
        [returnUrl]="returnUrl()"
      >
        @if (error(); as message) {
          <div class="form__alert" role="alert">
            <app-shell-icon name="alert" [size]="18" />
            <p>{{ message }}</p>
          </div>
        }
        <form
          class="form"
          [formGroup]="form"
          (ngSubmit)="submit()"
          novalidate
          aria-label="Reset password"
        >
          <div class="field field--first">
            <label class="field__label" for="rs-email">Email</label>
            <input
              id="rs-email"
              class="field__input"
              type="email"
              formControlName="email"
              autocomplete="email"
              required
              [attr.aria-invalid]="shows() ? 'true' : null"
              [attr.aria-describedby]="shows() ? 'rs-email-error' : null"
            />
            @if (shows()) {
              <p class="field__error" id="rs-email-error">
                {{
                  form.controls.email.hasError('required')
                    ? 'Enter your email address.'
                    : 'That email address does not look right.'
                }}
              </p>
            }
          </div>
          <button
            type="submit"
            class="btn btn--primary reset__send"
            [disabled]="submitting() || !auth.available()"
          >
            {{ submitting() ? 'Sending…' : 'Send reset link' }}
          </button>
        </form>
        <a
          class="link link--center reset__back"
          routerLink="/auth/sign-in"
          [queryParams]="{ returnUrl: returnUrl() ?? null }"
        >
          <app-shell-icon name="arrowLeft" [size]="18" [stroke]="2" />
          Back to sign in
        </a>
      </app-auth-layout>
    }
  `,
  styleUrl: '../auth-form.scss',
  styles: `
    .strong {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .reset__send {
      margin-top: 24px;
    }
    .reset__back {
      margin-top: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly auth = inject(AuthService);

  /** Prefilled from `?email=` (the sign-in form passes what was typed). */
  readonly email = input<string | undefined>();
  /** Where "Not now" and "Back to sign in" lead on (`?returnUrl=`). */
  readonly returnUrl = input<string | undefined>();
  protected readonly submitted = signal(false);

  protected shows(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.touched || this.submitted());
  }

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly submitting = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const email = this.email();
    if (email) {
      this.form.controls.email.setValue(email);
    }
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.submitting.set(true);
    try {
      await this.auth.sendPasswordReset(this.form.controls.email.value);
      this.sent.set(true);
    } catch (error) {
      if (authErrorCode(error) === 'auth/user-not-found') {
        this.sent.set(true);
      } else {
        this.error.set(authErrorMessage(error));
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
