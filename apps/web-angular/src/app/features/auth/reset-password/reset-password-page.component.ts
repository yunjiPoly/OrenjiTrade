import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { authErrorCode, authErrorMessage } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { focusFirstInvalid, focusHeading } from '../auth-focus';
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
        <button type="button" class="link link--center" (click)="anotherEmail()">
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
            [attr.aria-disabled]="submitting() || !auth.available() ? 'true' : null"
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

  /**
   * Prefilled with what was typed on Sign in, passed in the navigation's state (never in the
   * address, which a reload sends to the web host and history keeps: WG review U8); `?email=` of
   * an older link still works.
   */
  readonly email = input<string | undefined>();
  private readonly location = inject(Location);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
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
    const state = this.location.getState() as { email?: unknown } | null;
    const email = typeof state?.email === 'string' ? state.email : this.email();
    if (email) {
      this.form.controls.email.setValue(email);
    }
  }

  protected anotherEmail(): void {
    this.sent.set(false);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('#rs-email')?.focus());
  }

  protected async submit(): Promise<void> {
    if (this.submitting() || !this.auth.available()) {
      return;
    }
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement);
      return;
    }
    this.error.set(null);
    this.submitting.set(true);
    try {
      await this.auth.sendPasswordReset(this.form.controls.email.value);
      this.showSent();
    } catch (error) {
      if (authErrorCode(error) === 'auth/user-not-found') {
        this.showSent();
      } else {
        this.error.set(authErrorMessage(error));
      }
    } finally {
      this.submitting.set(false);
    }
  }

  /** "Check your inbox" replaces the form: the keyboard goes to its heading (WG review A1). */
  private showSent(): void {
    this.sent.set(true);
    focusHeading(this.host.nativeElement);
  }
}
