import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { authErrorCode, authErrorMessage } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';

/**
 * `/auth/reset-password`: sends a Firebase password-reset email. The confirmation never reveals
 * whether an account exists for the address.
 */
@Component({
  selector: 'app-reset-password-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    AuthLayoutComponent,
  ],
  template: `
    <app-auth-layout
      heading="Reset your password"
      subheading="We will email you a link to choose a new password."
    >
      @if (sent()) {
        <div class="form__alert form__alert--success" role="status">
          <mat-icon aria-hidden="true">mark_email_read</mat-icon>
          <p>
            If an account exists for <strong>{{ form.controls.email.value }}</strong
            >, a reset link is on its way. Check your inbox and spam folder.
          </p>
        </div>
        <div class="form__actions">
          <a matButton="filled" routerLink="/auth/sign-in">Back to sign in</a>
          <button matButton type="button" (click)="sent.set(false)">Use another email</button>
        </div>
      } @else {
        @if (error(); as message) {
          <div class="form__alert" role="alert">
            <mat-icon aria-hidden="true">error</mat-icon>
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
          <mat-form-field class="form__field" appearance="outline">
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email" required />
            <mat-icon matPrefix aria-hidden="true">mail</mat-icon>
            @if (form.controls.email.hasError('required')) {
              <mat-error>Enter your email address.</mat-error>
            } @else if (form.controls.email.hasError('email')) {
              <mat-error>That email address does not look right.</mat-error>
            }
          </mat-form-field>
          <button
            matButton="filled"
            type="submit"
            class="form__submit"
            [disabled]="submitting() || !auth.available()"
          >
            @if (submitting()) {
              <mat-spinner class="form__spinner" diameter="18" aria-hidden="true" />
            }
            Send reset link
          </button>
        </form>
        <p class="form__footer">Remembered it? <a routerLink="/auth/sign-in">Back to sign in</a></p>
      }
    </app-auth-layout>
  `,
  styleUrl: '../auth-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly auth = inject(AuthService);

  /** Prefilled from `?email=` (the sign-in form passes what was typed). */
  readonly email = input<string | undefined>();

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
