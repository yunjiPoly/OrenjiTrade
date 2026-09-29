import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { authErrorMessage } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { routeAfterSignIn } from '../auth-navigation';

const RESEND_COOLDOWN_S = 30;

/**
 * `/auth/verify-email`: explains the verification email, lets the collector resend it, confirm
 * it (reloads the Firebase user and the session) or continue and verify later.
 */
@Component({
  selector: 'app-verify-email-page',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, AuthLayoutComponent],
  template: `
    <app-auth-layout heading="Check your inbox" [subheading]="subheading()">
      @if (auth.emailVerified()) {
        <div class="form__alert form__alert--success" role="status">
          <mat-icon aria-hidden="true">verified</mat-icon>
          <p>Your email address is verified. Thanks!</p>
        </div>
      } @else {
        <div class="verify__art" aria-hidden="true">
          <mat-icon>mark_email_unread</mat-icon>
        </div>
        <p>
          We sent a verification link to <strong>{{ auth.user()?.email }}</strong
          >. Open it to confirm the address, then come back here.
        </p>
        @if (auth.usesEmulator()) {
          <div class="form__alert form__alert--info" role="note">
            <mat-icon aria-hidden="true">terminal</mat-icon>
            <p>
              Local development: no real email is sent. The Firebase Auth emulator lists the link in
              its logs and in the Emulator UI (Authentication tab).
            </p>
          </div>
        }
      }

      @if (message(); as text) {
        <div class="form__alert" [class.form__alert--info]="!messageIsError()" role="status">
          <mat-icon aria-hidden="true">{{ messageIsError() ? 'error' : 'info' }}</mat-icon>
          <p>{{ text }}</p>
        </div>
      }

      <div class="form">
        @if (auth.emailVerified()) {
          <button matButton="filled" type="button" class="form__submit" (click)="continue()">
            Continue
          </button>
        } @else {
          <button
            matButton="filled"
            type="button"
            class="form__submit"
            [disabled]="checking()"
            (click)="checkVerified()"
          >
            @if (checking()) {
              <mat-spinner class="form__spinner" diameter="18" aria-hidden="true" />
            }
            I have verified my email
          </button>
          <div class="form__actions">
            <button
              matButton="outlined"
              type="button"
              [disabled]="resending() || cooldown() > 0"
              (click)="resend()"
            >
              <mat-icon aria-hidden="true">forward_to_inbox</mat-icon>
              {{ cooldown() > 0 ? 'Resend in ' + cooldown() + ' s' : 'Resend email' }}
            </button>
            <button matButton type="button" (click)="continue()">Do this later</button>
          </div>
        }
      </div>
    </app-auth-layout>
  `,
  styleUrl: '../auth-form.scss',
  styles: `
    .verify__art {
      display: grid;
      place-items: center;
      width: 72px;
      height: 72px;
      margin-bottom: var(--spacing-4);
      border-radius: 50%;
      background: var(--color-primary-container);
      color: var(--color-primary);
    }
    .verify__art mat-icon {
      width: 36px;
      height: 36px;
      font-size: 36px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailPageComponent {
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);

  readonly returnUrl = input<string | undefined>();

  protected readonly subheading = computed(() =>
    this.auth.emailVerified() ? 'You are all set.' : 'One last step to secure your account.',
  );
  protected readonly checking = signal(false);
  protected readonly resending = signal(false);
  protected readonly cooldown = signal(0);
  protected readonly message = signal<string | null>(null);
  protected readonly messageIsError = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  protected async checkVerified(): Promise<void> {
    this.checking.set(true);
    this.message.set(null);
    try {
      const user = await this.auth.reloadUser();
      if (user?.emailVerified) {
        await this.auth.getIdToken(true);
        await this.session.load();
        await this.continue();
      } else {
        this.messageIsError.set(false);
        this.message.set('We do not see the verification yet. Open the link, then try again.');
      }
    } catch (error) {
      this.messageIsError.set(true);
      this.message.set(authErrorMessage(error));
    } finally {
      this.checking.set(false);
    }
  }

  protected async resend(): Promise<void> {
    this.resending.set(true);
    this.message.set(null);
    try {
      await this.auth.sendEmailVerification();
      this.messageIsError.set(false);
      this.message.set('A new verification email is on its way.');
      this.startCooldown();
    } catch (error) {
      this.messageIsError.set(true);
      this.message.set(authErrorMessage(error));
    } finally {
      this.resending.set(false);
    }
  }

  protected async continue(): Promise<void> {
    await routeAfterSignIn(this.session, this.router, this.returnUrl());
  }

  private startCooldown(): void {
    this.stopTimer();
    this.cooldown.set(RESEND_COOLDOWN_S);
    this.timer = setInterval(() => {
      this.cooldown.update((value) => Math.max(0, value - 1));
      if (this.cooldown() === 0) {
        this.stopTimer();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
