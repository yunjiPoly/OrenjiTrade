import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { authErrorMessage } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { routeAfterSignIn } from '../auth-navigation';

const RESEND_COOLDOWN_S = 30;

/**
 * `/auth/verify-email`, Verify your email (spec 14, board W27; the sign-in panel): the mail tile,
 * "We sent a verification link to {email}…", [I have verified my email] (reloads the Firebase user
 * and the session), [Resend email] (then "Resend in 30 s") and "Do this later". The same panel as
 * Sign in, without "Not now" (the account exists already).
 */
@Component({
  selector: 'app-verify-email-page',
  imports: [ShellIconComponent, AuthLayoutComponent],
  template: `
    <app-auth-layout [heading]="heading()" icon="mail">
      @if (auth.emailVerified()) {
        <p class="state__text">Your email address is verified. Thanks!</p>
        <button type="button" class="btn btn--primary btn--first" (click)="continue()">
          Continue
        </button>
      } @else {
        <p class="state__text">
          We sent a verification link to <strong class="strong">{{ email() }}</strong
          >. Open it to confirm the address, then come back here.
        </p>
        @if (auth.usesEmulator()) {
          <div class="form__alert form__alert--info" role="note">
            <app-shell-icon name="info" [size]="18" />
            <p>
              Local development: no real email is sent. The Firebase Auth emulator lists the link in
              its logs and in the Emulator UI (Authentication tab).
            </p>
          </div>
        }
        @if (message(); as text) {
          <div
            class="form__alert"
            [class.form__alert--success]="tone() !== 'error'"
            [attr.role]="tone() === 'error' ? 'alert' : 'status'"
          >
            <app-shell-icon
              [name]="tone() === 'error' ? 'alert' : tone() === 'sent' ? 'check' : 'info'"
              [size]="18"
            />
            <p>{{ text }}</p>
          </div>
        }
        <button
          type="button"
          class="btn btn--primary btn--first"
          [attr.aria-disabled]="checking() ? 'true' : null"
          (click)="checking() || checkVerified()"
        >
          {{ checking() ? 'Checking…' : 'I have verified my email' }}
        </button>
        <button
          type="button"
          class="btn btn--outline btn--small btn--after"
          [attr.aria-disabled]="resending() || cooldown() > 0 ? 'true' : null"
          (click)="resending() || cooldown() > 0 || resend()"
        >
          {{ cooldown() > 0 ? 'Resend in ' + cooldown() + ' s' : 'Resend email' }}
        </button>
        <button type="button" class="link link--center" (click)="continue()">Do this later</button>
      }
    </app-auth-layout>
  `,
  styleUrl: '../auth-form.scss',
  styles: `
    .strong {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
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

  protected readonly heading = computed(() =>
    this.auth.emailVerified() ? 'Your email is verified' : 'Verify your email',
  );
  protected readonly email = computed(() => this.auth.user()?.email ?? 'your email address');
  protected readonly checking = signal(false);
  protected readonly resending = signal(false);
  protected readonly cooldown = signal(0);
  protected readonly message = signal<string | null>(null);
  /** The note's kind: a refusal, a resent email (the board's check) or a plain note. */
  protected readonly tone = signal<'error' | 'sent' | 'note'>('note');
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
        this.tone.set('note');
        this.message.set('We do not see the verification yet. Open the link, then try again.');
      }
    } catch (error) {
      this.tone.set('error');
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
      this.tone.set('sent');
      this.message.set('A new verification email is on its way.');
      this.startCooldown();
    } catch (error) {
      this.tone.set('error');
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
